import json
import threading
import time
from pathlib import Path
from typing import Any, Callable, Optional, Tuple
from uuid import uuid4

from ..schemas import (
    BenchmarkTask,
    EvalJob,
    EvalJobKind,
    ExperimentMutationResponse,
    ExperimentState,
    ExperimentStateImportRequest,
    PatchExperimentResult,
    PatchExperimentTaskResult,
    PatchQueueItem,
    PatchQueueSourceInput,
    PatchQueueUpsertEntry,
    PreviewSuggestion,
    ProfileSections,
    ValidationRunKind,
    ValidationRunRecord,
)
from ..storage import (
    _atomic_write_json,
    get_project_paths,
    hydrate_project,
    iso_now,
    list_projects,
    load_benchmark_tasks,
    load_claims,
    load_profile,
    require_project,
)
from .preview import (
    compare_preview_outputs,
    generate_preview_training_suggestions,
    run_user_twin_preview,
)


MAX_HISTORY_RUNS = 24
MAX_EVAL_JOBS = 40
MAX_PATCH_QUEUE = 80


def _graph_path(project_id: str, filename: str) -> Path:
    return get_project_paths(project_id)["graph"] / filename


def _read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _create_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex}"


def _validation_history_path(project_id: str) -> Path:
    return _graph_path(project_id, "validation_runs.json")


def _patch_queue_path(project_id: str) -> Path:
    return _graph_path(project_id, "patch_queue.json")


def _eval_jobs_path(project_id: str) -> Path:
    return _graph_path(project_id, "eval_jobs.json")


def load_validation_history(project_id: str) -> list[ValidationRunRecord]:
    payload = _read_json(_validation_history_path(project_id), [])
    runs: list[ValidationRunRecord] = []
    changed = False
    for item in payload:
        try:
            runs.append(ValidationRunRecord.model_validate(item))
        except Exception:
            changed = True
    if changed:
        save_validation_history(project_id, runs)
    return runs


def save_validation_history(project_id: str, runs: list[ValidationRunRecord]) -> list[ValidationRunRecord]:
    trimmed = runs[:MAX_HISTORY_RUNS]
    _atomic_write_json(
        _validation_history_path(project_id),
        [run.model_dump(mode="json") for run in trimmed],
    )
    return trimmed


def append_validation_run(project_id: str, run: ValidationRunRecord) -> list[ValidationRunRecord]:
    return save_validation_history(project_id, [run, *load_validation_history(project_id)])


def load_patch_queue(project_id: str) -> list[PatchQueueItem]:
    payload = _read_json(_patch_queue_path(project_id), [])
    items: list[PatchQueueItem] = []
    changed = False
    for item in payload:
        try:
            items.append(PatchQueueItem.model_validate(item))
        except Exception:
            changed = True
    if changed:
        save_patch_queue(project_id, items)
    return items


def save_patch_queue(project_id: str, items: list[PatchQueueItem]) -> list[PatchQueueItem]:
    trimmed = items[:MAX_PATCH_QUEUE]
    _atomic_write_json(
        _patch_queue_path(project_id),
        [item.model_dump(mode="json") for item in trimmed],
    )
    return trimmed


def load_eval_jobs(project_id: str) -> list[EvalJob]:
    payload = _read_json(_eval_jobs_path(project_id), [])
    jobs: list[EvalJob] = []
    changed = False
    for item in payload:
        try:
            jobs.append(EvalJob.model_validate(item))
        except Exception:
            changed = True
    if changed:
        save_eval_jobs(project_id, jobs)
    return jobs


def save_eval_jobs(project_id: str, jobs: list[EvalJob]) -> list[EvalJob]:
    trimmed = jobs[:MAX_EVAL_JOBS]
    _atomic_write_json(
        _eval_jobs_path(project_id),
        [job.model_dump(mode="json") for job in trimmed],
    )
    return trimmed


def update_eval_job(project_id: str, job_id: str, patch: dict[str, Any]) -> list[EvalJob]:
    jobs = load_eval_jobs(project_id)
    next_jobs = [
        job.model_copy(update=patch) if job.id == job_id else job
        for job in jobs
    ]
    return save_eval_jobs(project_id, next_jobs)


def load_experiment_state(project_id: str) -> ExperimentState:
    return ExperimentState(
        validation_history=load_validation_history(project_id),
        patch_queue=load_patch_queue(project_id),
        eval_jobs=load_eval_jobs(project_id),
    )


def import_legacy_experiment_state(
    project_id: str,
    payload: ExperimentStateImportRequest,
) -> ExperimentMutationResponse:
    require_project(project_id)
    has_backend_state = any(
        [
            load_validation_history(project_id),
            load_patch_queue(project_id),
            load_eval_jobs(project_id),
        ]
    )
    if has_backend_state:
        return ExperimentMutationResponse(
            state=load_experiment_state(project_id),
            message="后端自动实验状态已存在，未覆盖现有数据。",
        )
    legacy_jobs = [
        job.model_copy(
            update={
                "status": "queued" if job.status in {"queued", "running"} else job.status,
                "started_at": None if job.status in {"queued", "running"} else job.started_at,
                "finished_at": None if job.status in {"queued", "running"} else job.finished_at,
                "error": (
                    "该任务从浏览器本地状态迁移而来，已重新放回后端队列继续执行。"
                    if job.status in {"queued", "running"}
                    else job.error
                ),
            }
        )
        for job in payload.eval_jobs
    ]
    save_validation_history(project_id, payload.validation_history)
    save_patch_queue(project_id, payload.patch_queue)
    save_eval_jobs(project_id, legacy_jobs)
    experiment_job_manager.wake()
    return ExperimentMutationResponse(
        state=load_experiment_state(project_id),
        message="已把本地自动实验状态迁移到后端，后续将由后端继续执行。",
    )


def persist_manual_preview_run(
    project_id: str,
    *,
    scenario: str,
    prompt: str,
    response: str,
    llm_used: bool,
    warnings: list[str],
    run_kind: ValidationRunKind,
    source_patch_id: Optional[str] = None,
) -> None:
    append_validation_run(
        project_id,
        ValidationRunRecord(
            id=_create_id(f"run-{run_kind}"),
            kind=run_kind,
            created_at=iso_now(),
            scenario=scenario,
            prompt=prompt,
            response=response,
            llm_used=llm_used,
            warnings=warnings,
            source_patch_id=source_patch_id,
        ),
    )


def upsert_patch_queue_entries(
    project_id: str,
    entries: list[PatchQueueUpsertEntry],
) -> ExperimentMutationResponse:
    require_project(project_id)
    current = load_patch_queue(project_id)
    next_items = list(current)
    for entry in entries:
        existing_index = next(
            (
                index
                for index, item in enumerate(next_items)
                if item.status == "pending"
                and item.suggestion.section == entry.suggestion.section
                and item.suggestion.suggested_text == entry.suggestion.suggested_text
            ),
            None,
        )
        if existing_index is not None:
            next_items[existing_index] = next_items[existing_index].model_copy(
                update={
                    "suggestion": entry.suggestion,
                    "created_at": iso_now(),
                    **entry.source.model_dump(),
                }
            )
            continue
        next_items.insert(
            0,
            PatchQueueItem(
                id=_create_id("patch"),
                created_at=iso_now(),
                status="pending",
                source_feedback=entry.source.source_feedback,
                source_feedback_note=entry.source.source_feedback_note,
                source_prompt=entry.source.source_prompt,
                source_scenario=entry.source.source_scenario,
                source_response_excerpt=entry.source.source_response_excerpt,
                suggestion=entry.suggestion,
                experiment_result=None,
                applied_at=None,
                dismissed_at=None,
            ),
        )
    save_patch_queue(project_id, next_items)
    return ExperimentMutationResponse(
        state=load_experiment_state(project_id),
        message="已把新的微调建议写入后端建议池。",
    )


def mark_patch_queue_item_applied(project_id: str, item_id_or_suggestion_id: str) -> ExperimentMutationResponse:
    require_project(project_id)
    next_items = [
        item.model_copy(
            update={"status": "applied", "applied_at": iso_now()}
        )
        if item.id == item_id_or_suggestion_id or item.suggestion.id == item_id_or_suggestion_id
        else item
        for item in load_patch_queue(project_id)
    ]
    save_patch_queue(project_id, next_items)
    return ExperimentMutationResponse(
        state=load_experiment_state(project_id),
        message="该微调建议已标记为已采纳。",
    )


def mark_patch_queue_item_dismissed(project_id: str, item_id: str) -> ExperimentMutationResponse:
    require_project(project_id)
    next_items = [
        item.model_copy(
            update={"status": "dismissed", "dismissed_at": iso_now()}
        )
        if item.id == item_id
        else item
        for item in load_patch_queue(project_id)
    ]
    save_patch_queue(project_id, next_items)
    return ExperimentMutationResponse(
        state=load_experiment_state(project_id),
        message="该微调建议已从待审列表移除。",
    )


def enqueue_benchmark_suite(project_id: str) -> ExperimentMutationResponse:
    project = hydrate_project(project_id)
    if not project.profile:
        raise ValueError("当前项目还没有已保存规则草稿，无法运行自动实验。")
    if not project.benchmark_tasks:
        raise ValueError("当前还没有自动实验任务集，请先重新蒸馏或手动重新生成任务集。")
    existing = next(
        (
            job
            for job in load_eval_jobs(project_id)
            if job.kind == "benchmark_suite" and job.status in {"queued", "running"}
        ),
        None,
    )
    if existing:
        return ExperimentMutationResponse(
            state=load_experiment_state(project_id),
            message="已有一个自动实验任务在队列中或执行中，可等待它完成后再看结果。",
        )
    jobs = save_eval_jobs(
        project_id,
        [
            EvalJob(
                id=_create_id("eval-benchmark"),
                kind="benchmark_suite",
                status="queued",
                created_at=iso_now(),
                started_at=None,
                finished_at=None,
                patch_queue_item_id=None,
                title=f"自动实验任务集（{len(project.benchmark_tasks)} 个）",
                total_steps=len(project.benchmark_tasks),
                completed_steps=0,
                summary=None,
                error=None,
            ),
            *load_eval_jobs(project_id),
        ],
    )
    experiment_job_manager.wake()
    return ExperimentMutationResponse(
        state=ExperimentState(
            validation_history=load_validation_history(project_id),
            patch_queue=load_patch_queue(project_id),
            eval_jobs=jobs,
        ),
        message=f"已新建自动实验任务，共 {len(project.benchmark_tasks)} 个评测项，结果会由后端异步返回。",
    )


def enqueue_patch_compare(project_id: str, item_id: str) -> ExperimentMutationResponse:
    project = hydrate_project(project_id)
    if not project.profile:
        raise ValueError("当前项目还没有已保存规则草稿，无法运行微调建议对比。")
    if not project.benchmark_tasks:
        raise ValueError("当前还没有自动实验任务集，请先重新蒸馏或手动重新生成任务集。")
    item = next((entry for entry in load_patch_queue(project_id) if entry.id == item_id), None)
    if item is None:
        raise KeyError(item_id)
    existing = next(
        (
            job
            for job in load_eval_jobs(project_id)
            if job.kind == "patch_compare"
            and job.patch_queue_item_id == item.id
            and job.status in {"queued", "running"}
        ),
        None,
    )
    if existing:
        return ExperimentMutationResponse(
            state=load_experiment_state(project_id),
            message=f"「{item.suggestion.title}」已有一个评测任务在执行中。",
        )
    jobs = save_eval_jobs(
        project_id,
        [
            EvalJob(
                id=_create_id("eval-patch"),
                kind="patch_compare",
                status="queued",
                created_at=iso_now(),
                started_at=None,
                finished_at=None,
                patch_queue_item_id=item.id,
                title=item.suggestion.title,
                total_steps=len(project.benchmark_tasks),
                completed_steps=0,
                summary=None,
                error=None,
            ),
            *load_eval_jobs(project_id),
        ],
    )
    experiment_job_manager.wake()
    return ExperimentMutationResponse(
        state=ExperimentState(
            validation_history=load_validation_history(project_id),
            patch_queue=load_patch_queue(project_id),
            eval_jobs=jobs,
        ),
        message=f"已为「{item.suggestion.title}」新建评测任务，结果会由后端异步返回。",
    )


def enqueue_pending_patch_compares(project_id: str) -> ExperimentMutationResponse:
    project = hydrate_project(project_id)
    if not project.profile:
        raise ValueError("当前项目还没有已保存规则草稿，无法运行微调建议对比。")
    if not project.benchmark_tasks:
        raise ValueError("当前还没有自动实验任务集，请先重新蒸馏或手动重新生成任务集。")
    pending_items = [
        item
        for item in load_patch_queue(project_id)
        if item.status == "pending" and item.experiment_result is None
    ]
    if not pending_items:
        return ExperimentMutationResponse(
            state=load_experiment_state(project_id),
            message="当前没有待审微调建议可批量比较。",
        )
    queued_or_running_ids = {
        job.patch_queue_item_id
        for job in load_eval_jobs(project_id)
        if job.kind == "patch_compare" and job.status in {"queued", "running"}
    }
    items_to_queue = [item for item in pending_items if item.id not in queued_or_running_ids]
    if not items_to_queue:
        return ExperimentMutationResponse(
            state=load_experiment_state(project_id),
            message="这些待审微调建议已经在评测队列中或正在执行。",
        )
    jobs = save_eval_jobs(
        project_id,
        [
            *[
                EvalJob(
                    id=_create_id("eval-patch"),
                    kind="patch_compare",
                    status="queued",
                    created_at=iso_now(),
                    started_at=None,
                    finished_at=None,
                    patch_queue_item_id=item.id,
                    title=item.suggestion.title,
                    total_steps=len(project.benchmark_tasks),
                    completed_steps=0,
                    summary=None,
                    error=None,
                )
                for item in items_to_queue
            ],
            *load_eval_jobs(project_id),
        ],
    )
    experiment_job_manager.wake()
    return ExperimentMutationResponse(
        state=ExperimentState(
            validation_history=load_validation_history(project_id),
            patch_queue=load_patch_queue(project_id),
            eval_jobs=jobs,
        ),
        message=f"已新建 {len(items_to_queue)} 个微调建议评测任务，结果会由后端异步返回。",
    )


def generate_benchmark_suggestions(project_id: str) -> ExperimentMutationResponse:
    project = hydrate_project(project_id)
    if not project.profile:
        raise ValueError("当前项目还没有已保存规则草稿，无法生成自动实验建议。")
    if not project.benchmark_tasks:
        raise ValueError("当前还没有自动实验任务集，请先重新蒸馏或手动重新生成任务集。")
    latest_runs = latest_benchmark_base_runs(load_validation_history(project_id), len(project.benchmark_tasks))
    if not latest_runs:
        raise ValueError("先跑一次当前版本自动实验，再根据这些结果生成微调建议。")

    collected: list[AutoSuggestionDraft] = []
    claims = [claim.model_dump() for claim in load_claims(project_id)]
    for run in latest_runs:
        task = next(
            (
                entry
                for entry in project.benchmark_tasks
                if entry.prompt == run.prompt and entry.scenario == run.scenario
            ),
            None,
        )
        feedback = generate_preview_training_suggestions(
            scenario=run.scenario,
            prompt=run.prompt,
            response=run.response,
            feedback="不太像",
            feedback_note=build_auto_experiment_feedback_note(task),
            profile=project.profile,
            claims=claims,
        )
        collected.extend(
            [
                AutoSuggestionDraft(
                    suggestion=suggestion,
                    task=task,
                    prompt=run.prompt,
                    scenario=run.scenario,
                    response_excerpt=run.response[:220],
                )
                for suggestion in feedback.suggestions
            ]
        )
    entries = aggregate_auto_experiment_suggestions(collected)
    next_state = upsert_patch_queue_entries(project_id, entries).state
    message = (
        f"已根据最近一次自动实验筛选出 {len(entries)} 条高价值微调建议，并同步加入后端建议池。"
        if entries
        else "最近一次自动实验已分析完成，但暂时没有产出新的微调建议。"
    )
    return ExperimentMutationResponse(state=next_state, message=message)


class AutoSuggestionDraft:
    def __init__(
        self,
        *,
        suggestion: PreviewSuggestion,
        task: Optional[BenchmarkTask],
        prompt: str,
        scenario: str,
        response_excerpt: str,
    ) -> None:
        self.suggestion = suggestion
        self.task = task
        self.prompt = prompt
        self.scenario = scenario
        self.response_excerpt = response_excerpt


def latest_benchmark_base_runs(runs: list[ValidationRunRecord], task_count: int) -> list[ValidationRunRecord]:
    return [run for run in runs if run.kind == "benchmark_base" and not run.source_patch_id][: max(task_count, 1)]


def build_auto_experiment_feedback_note(task: Optional[BenchmarkTask]) -> str:
    if task and task.source_hint:
        return f"这是自动实验任务，请重点检查「{task.source_hint}」是否被当前输出稳定体现，并给出最值得优先加入规则草稿的微调建议。"
    if task and task.title:
        return f"这是自动实验任务「{task.title}」，请根据任务与当前输出，给出最值得优先加入规则草稿的微调建议。"
    return "这是自动实验任务，请根据任务与当前输出，给出最值得优先加入规则草稿的微调建议。"


def normalize_suggestion_text(text: str) -> str:
    return " ".join(text.strip().split())


def _push_unique(values: list[str], value: str) -> list[str]:
    next_value = value.strip()
    if not next_value or next_value in values:
        return values
    return [*values, next_value]


def aggregate_auto_experiment_suggestions(
    drafts: list[AutoSuggestionDraft],
    limit: int = 6,
) -> list[PatchQueueUpsertEntry]:
    groups: dict[str, dict[str, Any]] = {}
    for draft in drafts:
        key = f"{draft.suggestion.section}::{normalize_suggestion_text(draft.suggestion.suggested_text)}"
        current = groups.get(key)
        if current is None:
            groups[key] = {
                "suggestion": draft.suggestion,
                "support_count": 1,
                "reasons": [draft.suggestion.reason] if draft.suggestion.reason else [],
                "task_titles": [draft.task.title] if draft.task and draft.task.title else [],
                "source_hints": [draft.task.source_hint] if draft.task and draft.task.source_hint else [],
                "prompts": [draft.prompt],
                "scenarios": [draft.scenario],
                "response_excerpt": draft.response_excerpt,
                "target_claim_ids": set(draft.suggestion.target_claim_ids),
            }
            continue
        current["support_count"] += 1
        current["reasons"] = _push_unique(current["reasons"], draft.suggestion.reason)
        current["task_titles"] = _push_unique(current["task_titles"], draft.task.title if draft.task else "")
        current["source_hints"] = _push_unique(current["source_hints"], draft.task.source_hint if draft.task else "")
        current["prompts"] = _push_unique(current["prompts"], draft.prompt)
        current["scenarios"] = _push_unique(current["scenarios"], draft.scenario)
        current["target_claim_ids"].update(draft.suggestion.target_claim_ids)

    ranked = sorted(
        groups.values(),
        key=lambda item: (
            -item["support_count"],
            -len(item["target_claim_ids"]),
            item["suggestion"].section,
        ),
    )[:limit]
    entries: list[PatchQueueUpsertEntry] = []
    for group in ranked:
        support = group["support_count"]
        titles = "、".join(group["task_titles"][:2])
        hints = "；".join(group["source_hints"][:2])
        reason_bits = [*group["reasons"][:2]]
        if titles:
            reason_bits.append(f"反复出现在任务「{titles}」里")
        if hints:
            reason_bits.append(f"重点暴露在：{hints}")
        if support > 1:
            reason_bits.append(f"共有 {support} 个任务支持这条建议")
        enriched = group["suggestion"].model_copy(
            update={
                "reason": "；".join([bit for bit in reason_bits if bit]) or group["suggestion"].reason,
                "target_claim_ids": sorted(group["target_claim_ids"]),
            }
        )
        entries.append(
            PatchQueueUpsertEntry(
                suggestion=enriched,
                source=PatchQueueSourceInput(
                    source_feedback="自动实验",
                    source_feedback_note="；".join([bit for bit in group["source_hints"][:3] if bit]),
                    source_prompt=group["prompts"][0],
                    source_scenario=group["scenarios"][0],
                    source_response_excerpt=group["response_excerpt"],
                ),
            )
        )
    return entries


def merge_preview_suggestion_into_profile(profile: ProfileSections, suggestion: PreviewSuggestion) -> ProfileSections:
    values = list(getattr(profile, suggestion.section))
    if suggestion.suggested_text not in values:
        values.insert(0, suggestion.suggested_text)
    return profile.model_copy(update={suggestion.section: values})


def summarize_patch_experiment(task_results: list[PatchExperimentTaskResult]) -> PatchExperimentResult:
    baseline_wins = len([item for item in task_results if item.winner == "baseline"])
    candidate_wins = len([item for item in task_results if item.winner == "candidate"])
    ties = len([item for item in task_results if item.winner == "tie"])
    score_delta = sum(item.candidate_score - item.baseline_score for item in task_results)
    return PatchExperimentResult(
        id=_create_id("experiment"),
        created_at=iso_now(),
        baseline_wins=baseline_wins,
        candidate_wins=candidate_wins,
        ties=ties,
        score_delta=score_delta,
        task_results=task_results,
    )


class ExperimentJobManager:
    def __init__(self) -> None:
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._wake_event.clear()
            self._requeue_inflight_jobs()
            self._thread = threading.Thread(
                target=self._run_loop,
                name="experiment-job-worker",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def wake(self) -> None:
        self._wake_event.set()

    def _requeue_inflight_jobs(self) -> None:
        for project in list_projects():
            jobs = load_eval_jobs(project.id)
            changed = False
            next_jobs: list[EvalJob] = []
            for job in jobs:
                if job.status == "running":
                    changed = True
                    next_jobs.append(
                        job.model_copy(
                            update={
                                "status": "queued",
                                "started_at": None,
                                "finished_at": None,
                                "error": "服务重启后已自动恢复到队列中，将继续由后端执行。",
                            }
                        )
                    )
                else:
                    next_jobs.append(job)
            if changed:
                save_eval_jobs(project.id, next_jobs)

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            job_ref = self._claim_next_job()
            if job_ref is None:
                self._wake_event.wait(timeout=1.0)
                self._wake_event.clear()
                continue
            project_id, job_id = job_ref
            self._process_job(project_id, job_id)

    def _claim_next_job(self) -> Optional[Tuple[str, str]]:
        for project in list_projects():
            jobs = load_eval_jobs(project.id)
            next_job = next((job for job in jobs if job.status == "queued"), None)
            if next_job is None:
                continue
            update_eval_job(
                project.id,
                next_job.id,
                {
                    "status": "running",
                    "started_at": iso_now(),
                    "finished_at": None,
                    "error": None,
                },
            )
            return project.id, next_job.id
        return None

    def _process_job(self, project_id: str, job_id: str) -> None:
        jobs = load_eval_jobs(project_id)
        job = next((entry for entry in jobs if entry.id == job_id), None)
        if job is None:
            return
        try:
            if job.kind == "benchmark_suite":
                self._run_benchmark_suite(project_id, job)
            else:
                self._run_patch_compare(project_id, job)
        except Exception as exc:
            update_eval_job(
                project_id,
                job.id,
                {
                    "status": "failed",
                    "finished_at": iso_now(),
                    "error": str(exc),
                },
            )

    def _run_benchmark_suite(self, project_id: str, job: EvalJob) -> None:
        project = hydrate_project(project_id)
        if not project.profile:
            raise ValueError("当前项目还没有已保存规则草稿，无法运行自动实验。")
        tasks = load_benchmark_tasks(project_id)
        if not tasks:
            raise ValueError("当前还没有自动实验任务集，请先重新蒸馏或手动重新生成任务集。")
        claims = [claim.model_dump() for claim in load_claims(project_id)]
        next_runs: list[ValidationRunRecord] = []
        for index, task in enumerate(tasks):
            result = run_user_twin_preview(
                project_name=project.name,
                scenario=task.scenario,
                prompt=task.prompt,
                profile=project.profile,
                claims=claims,
            )
            next_runs.append(
                ValidationRunRecord(
                    id=_create_id(f"bench-{task.id}"),
                    kind="benchmark_base",
                    created_at=iso_now(),
                    scenario=task.scenario,
                    prompt=task.prompt,
                    response=result.response,
                    llm_used=result.llm_used,
                    warnings=result.warnings,
                    source_patch_id=None,
                )
            )
            update_eval_job(
                project_id,
                job.id,
                {"completed_steps": index + 1},
            )
        save_validation_history(project_id, [*next_runs, *load_validation_history(project_id)])
        update_eval_job(
            project_id,
            job.id,
            {
                "status": "completed",
                "finished_at": iso_now(),
                "completed_steps": len(tasks),
                "summary": f"已完成 {len(tasks)} 个自动实验任务，可继续从结果生成微调建议。",
                "error": None,
            },
        )

    def _run_patch_compare(self, project_id: str, job: EvalJob) -> None:
        project = hydrate_project(project_id)
        if not project.profile:
            raise ValueError("当前项目还没有已保存规则草稿，无法运行微调建议对比。")
        tasks = load_benchmark_tasks(project_id)
        if not tasks:
            raise ValueError("当前还没有自动实验任务集，请先重新蒸馏或手动重新生成任务集。")
        if not job.patch_queue_item_id:
            raise ValueError("没有找到对应的微调建议评测任务。")
        queue = load_patch_queue(project_id)
        item = next((entry for entry in queue if entry.id == job.patch_queue_item_id), None)
        if item is None:
            raise ValueError("对应的微调建议已不存在，无法继续评测。")

        claims = [claim.model_dump() for claim in load_claims(project_id)]
        candidate_profile = merge_preview_suggestion_into_profile(project.profile, item.suggestion)
        task_results: list[PatchExperimentTaskResult] = []
        candidate_runs: list[ValidationRunRecord] = []
        for index, task in enumerate(tasks):
            baseline = run_user_twin_preview(
                project_name=project.name,
                scenario=task.scenario,
                prompt=task.prompt,
                profile=project.profile,
                claims=claims,
            )
            candidate = run_user_twin_preview(
                project_name=project.name,
                scenario=task.scenario,
                prompt=task.prompt,
                profile=candidate_profile,
                claims=claims,
            )
            judged = compare_preview_outputs(
                scenario=task.scenario,
                prompt=task.prompt,
                baseline_response=baseline.response,
                candidate_response=candidate.response,
            )
            task_results.append(
                PatchExperimentTaskResult(
                    task_id=task.id,
                    task_title=task.title,
                    baseline_response=baseline.response,
                    candidate_response=candidate.response,
                    winner=judged.winner,
                    rationale=judged.rationale,
                    baseline_score=judged.baseline_score,
                    candidate_score=judged.candidate_score,
                )
            )
            candidate_runs.append(
                ValidationRunRecord(
                    id=_create_id(f"candidate-{task.id}"),
                    kind="benchmark_candidate",
                    created_at=iso_now(),
                    scenario=task.scenario,
                    prompt=task.prompt,
                    response=candidate.response,
                    llm_used=candidate.llm_used,
                    warnings=candidate.warnings,
                    source_patch_id=item.id,
                )
            )
            update_eval_job(
                project_id,
                job.id,
                {"completed_steps": index + 1},
            )

        result = summarize_patch_experiment(task_results)
        next_queue = [
            queue_item.model_copy(update={"experiment_result": result})
            if queue_item.id == item.id
            else queue_item
            for queue_item in load_patch_queue(project_id)
        ]
        save_patch_queue(project_id, next_queue)
        save_validation_history(project_id, [*candidate_runs, *load_validation_history(project_id)])
        update_eval_job(
            project_id,
            job.id,
            {
                "status": "completed",
                "finished_at": iso_now(),
                "completed_steps": len(tasks),
                "summary": f"{item.suggestion.title} 已完成自动实验比较。",
                "error": None,
            },
        )


experiment_job_manager = ExperimentJobManager()
