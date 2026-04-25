from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .config import llm_is_configured
from .schemas import (
    BenchmarkTask,
    ClaimCreate,
    ClaimUpdate,
    DistillationMeta,
    DistillRequest,
    DistillResponse,
    DocumentLinkImportRequest,
    DocumentDetail,
    ExperimentMutationResponse,
    ExperimentPatchQueueUpsertRequest,
    ExperimentState,
    ExperimentStateImportRequest,
    ExportResponse,
    PreviewCompareRequest,
    PreviewCompareResponse,
    PreviewFeedbackRequest,
    PreviewFeedbackResponse,
    PreviewRequest,
    PreviewResponse,
    ProfileUpdate,
    ProjectCreate,
    ProjectDetail,
    ProjectSummary,
)
from .services.distill import (
    distill_user_operating_system,
    merge_claims,
    rebuild_profile_from_claims,
)
from .services.exporter import export_skill_bundle
from .services.experiments import (
    enqueue_benchmark_suite,
    enqueue_patch_compare,
    enqueue_pending_patch_compares,
    experiment_job_manager,
    generate_benchmark_suggestions,
    import_legacy_experiment_state,
    load_experiment_state,
    mark_patch_queue_item_applied,
    mark_patch_queue_item_dismissed,
    persist_manual_preview_run,
    upsert_patch_queue_entries,
)
from .services.ingest import classify_document_type, import_link_document, normalize_document
from .services.llm_distill import llm_distill_user_operating_system, llm_generate_benchmark_tasks
from .services.preview import compare_preview_outputs, generate_preview_training_suggestions, run_user_twin_preview
from .storage import (
    add_document,
    create_project,
    get_document_detail,
    hydrate_project,
    list_projects,
    load_claims,
    load_document_texts,
    load_profile,
    require_project,
    reset_export_dir,
    save_benchmark_tasks,
    save_claims,
    save_distillation,
    save_distillation_meta,
    save_profile,
    update_claim,
    upsert_claim,
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    experiment_job_manager.start()
    try:
        yield
    finally:
        experiment_job_manager.stop()


app = FastAPI(title="User Twin Skill Studio API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"status": "ok", "llm_configured": llm_is_configured()}


@app.get("/api/projects", response_model=list[ProjectSummary])
def get_projects() -> list[ProjectSummary]:
    return list_projects()


@app.post("/api/projects", response_model=ProjectDetail)
def post_project(payload: ProjectCreate) -> ProjectDetail:
    project = create_project(payload.name)
    return hydrate_project(project.id)


@app.get("/api/projects/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str) -> ProjectDetail:
    try:
        return hydrate_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@app.get("/api/projects/{project_id}/documents/{document_id}", response_model=DocumentDetail)
def get_document(project_id: str, document_id: str) -> DocumentDetail:
    try:
        require_project(project_id)
        return get_document_detail(project_id, document_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Document not found") from exc


@app.post("/api/projects/{project_id}/documents/upload", response_model=ProjectDetail)
async def upload_documents(
    project_id: str,
    files: list[UploadFile] = File(...),
) -> ProjectDetail:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    for file in files:
        content = await file.read()
        normalized = normalize_document(file.filename, content)
        document_type = classify_document_type(file.filename, normalized)
        add_document(
            project_id=project_id,
            filename=file.filename,
            media_type=file.content_type or "application/octet-stream",
            document_type=document_type,
            content=content,
            normalized_text=normalized,
        )
    return hydrate_project(project_id)


@app.post("/api/projects/{project_id}/documents/import-link", response_model=ProjectDetail)
def import_document_link(project_id: str, payload: DocumentLinkImportRequest) -> ProjectDetail:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    try:
        filename, media_type, content, normalized = import_link_document(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    document_type = classify_document_type(filename, normalized)
    add_document(
        project_id=project_id,
        filename=filename,
        media_type=media_type,
        document_type=document_type,
        content=content,
        normalized_text=normalized,
    )
    return hydrate_project(project_id)


@app.post("/api/projects/{project_id}/distill", response_model=DistillResponse)
def distill_project(project_id: str, payload: DistillRequest) -> DistillResponse:
    try:
        project = require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    documents = load_document_texts(project_id)
    if not documents:
        raise HTTPException(status_code=400, detail="Please upload documents first")

    llm_claims: list[dict] = []
    llm_profile: dict = {}
    llm_meta = {
        "llm_used": False,
        "llm_error": None,
        "invalid_claims_dropped": 0,
        "invalid_claim_examples": [],
    }
    heuristic_claims: list[dict] = []

    def _tag_distill_source(claims: list[dict], source: str) -> None:
        for claim in claims:
            claim["distill_source"] = source

    if payload.mode in {"llm", "hybrid"}:
        if not llm_is_configured():
            raise HTTPException(
                status_code=400,
                detail="LLM distillation requires configured USER_TWIN_LLM_BASE_URL / API_KEY / MODEL",
            )
        llm_claims, llm_profile, llm_meta = llm_distill_user_operating_system(
            project.name, documents
        )
        _tag_distill_source(llm_claims, "llm")
        llm_used = bool(llm_meta.get("llm_used"))
        if not llm_used or not llm_claims or not llm_profile:
            raise HTTPException(
                status_code=502,
                detail=f"LLM distillation failed: {llm_meta.get('llm_error') or 'No valid claims/profile returned'}",
            )

        if payload.mode == "hybrid":
            heuristic_claims, _, _ = distill_user_operating_system(
                project.name, documents
            )
            _tag_distill_source(heuristic_claims, "heuristic")
            claims = merge_claims(llm_claims, heuristic_claims)
            profile = llm_profile
        else:
            claims = llm_claims
            profile = llm_profile
        llm_used = True
    else:
        heuristic_claims, heuristic_profile, stats = distill_user_operating_system(project.name, documents)
        _tag_distill_source(heuristic_claims, "heuristic")
        claims = heuristic_claims
        profile = heuristic_profile
        llm_used = False

    if payload.mode in {"llm", "hybrid"}:
        stats = {
            "documents": len(documents),
            "llm_claims": len(llm_claims),
            "final_claims": len(claims),
            "invalid_claims_dropped": int(llm_meta.get("invalid_claims_dropped", 0)),
            "llm_configured": int(llm_is_configured()),
        }
        if payload.mode == "hybrid":
            stats["heuristic_claims"] = len(heuristic_claims)
    else:
        stats["llm_configured"] = int(llm_is_configured())
        stats["llm_claims"] = 0
        stats["final_claims"] = len(claims)
        stats["invalid_claims_dropped"] = 0

    distillation_meta = DistillationMeta(
        mode=payload.mode,
        llm_configured=llm_is_configured(),
        llm_used=llm_used,
        llm_error=llm_meta.get("llm_error"),
        invalid_claims_dropped=int(llm_meta.get("invalid_claims_dropped", 0)),
        invalid_claim_examples=list(llm_meta.get("invalid_claim_examples", [])),
        last_run_at=datetime.now(timezone.utc),
    )
    try:
        save_distillation(project_id, claims, profile)
        save_distillation_meta(project_id, distillation_meta)
        benchmark_tasks, _ = llm_generate_benchmark_tasks(
            project.name,
            documents,
            profile,
            claims,
        )
        save_benchmark_tasks(project_id, benchmark_tasks)
    except Exception as exc:
        distillation_meta.llm_error = (
            f"Distillation persistence failed: {str(exc).replace(chr(10), ' ')[:240]}"
        )
        save_distillation_meta(project_id, distillation_meta)
        raise HTTPException(
            status_code=500,
            detail="Distillation result validation failed before save",
        ) from exc
    return DistillResponse(
        project=hydrate_project(project_id),
        stats=stats,
        mode=payload.mode,
        llm_used=llm_used,
        llm_error=distillation_meta.llm_error,
    )


@app.post("/api/projects/{project_id}/benchmark/regenerate", response_model=ProjectDetail)
def regenerate_benchmark(project_id: str) -> ProjectDetail:
    try:
        project = require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    documents = load_document_texts(project_id)
    profile = load_profile(project_id)
    claims = load_claims(project_id)
    if not documents or profile is None or not claims:
        raise HTTPException(status_code=400, detail="Please distill the project first")

    benchmark_tasks, _ = llm_generate_benchmark_tasks(
        project.name,
        documents,
        profile.model_dump(),
        [claim.model_dump() for claim in claims],
    )
    save_benchmark_tasks(project_id, benchmark_tasks)
    return hydrate_project(project_id)


@app.get("/api/projects/{project_id}/experiments/state", response_model=ExperimentState)
def get_experiment_state(project_id: str) -> ExperimentState:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    return load_experiment_state(project_id)


@app.post(
    "/api/projects/{project_id}/experiments/import-legacy",
    response_model=ExperimentMutationResponse,
)
def post_import_legacy_experiment_state(
    project_id: str,
    payload: ExperimentStateImportRequest,
) -> ExperimentMutationResponse:
    try:
        return import_legacy_experiment_state(project_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@app.post(
    "/api/projects/{project_id}/experiments/patch-queue/upsert",
    response_model=ExperimentMutationResponse,
)
def post_patch_queue_entries(
    project_id: str,
    payload: ExperimentPatchQueueUpsertRequest,
) -> ExperimentMutationResponse:
    try:
        return upsert_patch_queue_entries(project_id, payload.entries)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@app.post(
    "/api/projects/{project_id}/experiments/patches/{item_id}/apply",
    response_model=ExperimentMutationResponse,
)
def post_apply_patch_queue_item(project_id: str, item_id: str) -> ExperimentMutationResponse:
    try:
        return mark_patch_queue_item_applied(project_id, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@app.post(
    "/api/projects/{project_id}/experiments/patches/{item_id}/dismiss",
    response_model=ExperimentMutationResponse,
)
def post_dismiss_patch_queue_item(project_id: str, item_id: str) -> ExperimentMutationResponse:
    try:
        return mark_patch_queue_item_dismissed(project_id, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc


@app.post(
    "/api/projects/{project_id}/experiments/benchmark/run",
    response_model=ExperimentMutationResponse,
)
def post_run_benchmark_suite(project_id: str) -> ExperimentMutationResponse:
    try:
        return enqueue_benchmark_suite(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post(
    "/api/projects/{project_id}/experiments/benchmark/suggestions",
    response_model=ExperimentMutationResponse,
)
def post_generate_benchmark_suggestions(project_id: str) -> ExperimentMutationResponse:
    try:
        return generate_benchmark_suggestions(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post(
    "/api/projects/{project_id}/experiments/patches/{item_id}/compare",
    response_model=ExperimentMutationResponse,
)
def post_compare_patch_queue_item(project_id: str, item_id: str) -> ExperimentMutationResponse:
    try:
        return enqueue_patch_compare(project_id, item_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Patch queue item not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post(
    "/api/projects/{project_id}/experiments/patches/compare-pending",
    response_model=ExperimentMutationResponse,
)
def post_compare_pending_patch_queue_items(project_id: str) -> ExperimentMutationResponse:
    try:
        return enqueue_pending_patch_compares(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/api/projects/{project_id}/profile", response_model=ProjectDetail)
def update_project_profile(project_id: str, payload: ProfileUpdate) -> ProjectDetail:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    save_profile(project_id, payload)
    return hydrate_project(project_id)


@app.patch("/api/projects/{project_id}/claims/{claim_id}", response_model=ProjectDetail)
def patch_claim(project_id: str, claim_id: str, payload: ClaimUpdate) -> ProjectDetail:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    try:
        update_claim(project_id, claim_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Claim not found") from exc
    return hydrate_project(project_id)


@app.post("/api/projects/{project_id}/claims", response_model=ProjectDetail)
def create_claim(project_id: str, payload: ClaimCreate) -> ProjectDetail:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    upsert_claim(project_id, payload)
    return hydrate_project(project_id)


@app.post("/api/projects/{project_id}/rebuild-profile", response_model=DistillResponse)
def rebuild_profile(project_id: str) -> DistillResponse:
    try:
        project = require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    documents = load_document_texts(project_id)
    claims = load_claims(project_id)
    if not documents or not claims:
        raise HTTPException(status_code=400, detail="Please distill the project first")

    claim_payload = [claim.model_dump() for claim in claims]
    profile = rebuild_profile_from_claims(project.name, documents, claim_payload)
    save_claims(project_id, claims)
    save_profile(project_id, profile)
    stats = {
        "documents": len(documents),
        "claims_considered": len([claim for claim in claims if claim.selected]),
        "rejected_claims": len([claim for claim in claims if claim.review_status == "rejected"]),
    }
    save_distillation_meta(
        project_id,
        DistillationMeta(
            mode="heuristic",
            llm_configured=llm_is_configured(),
            llm_used=False,
            llm_error=None,
            invalid_claims_dropped=0,
            invalid_claim_examples=[],
            last_run_at=datetime.now(timezone.utc),
        ),
    )
    return DistillResponse(
        project=hydrate_project(project_id),
        stats=stats,
        mode="heuristic",
        llm_used=False,
        llm_error=None,
    )


@app.post("/api/projects/{project_id}/preview-run", response_model=PreviewResponse)
def preview_run(project_id: str, payload: PreviewRequest) -> PreviewResponse:
    try:
        project = require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    profile = payload.profile_override or load_profile(project_id)
    claims = load_claims(project_id)
    if profile is None or not claims:
        raise HTTPException(status_code=400, detail="Please distill the project first")

    result = run_user_twin_preview(
        project_name=project.name,
        scenario=payload.scenario,
        prompt=payload.prompt,
        profile=profile,
        claims=[claim.model_dump() for claim in claims],
    )
    if payload.persist_run:
        persist_manual_preview_run(
            project_id,
            scenario=payload.scenario,
            prompt=payload.prompt,
            response=result.response,
            llm_used=result.llm_used,
            warnings=result.warnings,
            run_kind=payload.run_kind,
            source_patch_id=payload.source_patch_id,
        )
    return result


@app.post("/api/projects/{project_id}/preview-compare", response_model=PreviewCompareResponse)
def preview_compare(project_id: str, payload: PreviewCompareRequest) -> PreviewCompareResponse:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    return compare_preview_outputs(
        scenario=payload.scenario,
        prompt=payload.prompt,
        baseline_response=payload.baseline_response,
        candidate_response=payload.candidate_response,
    )


@app.post("/api/projects/{project_id}/preview-feedback", response_model=PreviewFeedbackResponse)
def preview_feedback(project_id: str, payload: PreviewFeedbackRequest) -> PreviewFeedbackResponse:
    try:
        require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    profile = load_profile(project_id)
    claims = load_claims(project_id)
    if profile is None or not claims:
        raise HTTPException(status_code=400, detail="Please distill the project first")

    return generate_preview_training_suggestions(
        scenario=payload.scenario,
        prompt=payload.prompt,
        response=payload.response,
        feedback=payload.feedback,
        feedback_note=payload.feedback_note,
        profile=profile,
        claims=[claim.model_dump() for claim in claims],
    )


@app.post("/api/projects/{project_id}/export-skill", response_model=ExportResponse)
def export_skill(project_id: str) -> ExportResponse:
    try:
        project = require_project(project_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Project not found") from exc

    profile = load_profile(project_id)
    claims = load_claims(project_id)
    if profile is None or not claims:
        raise HTTPException(status_code=400, detail="Please distill the project first")

    export_dir = reset_export_dir(project_id)
    export_skill_bundle(export_dir, project.name, profile, claims)
    return ExportResponse(project=hydrate_project(project_id), export_root=str(export_dir))
