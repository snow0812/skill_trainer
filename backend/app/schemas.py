from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


CLAIM_TYPE_VALUES = (
    "identity",
    "principle",
    "preference",
    "decision_rule",
    "workflow",
    "voice_pattern",
    "boundary",
    "artifact_pattern",
)

ClaimType = Literal[
    "identity",
    "principle",
    "preference",
    "decision_rule",
    "workflow",
    "voice_pattern",
    "boundary",
    "artifact_pattern",
]

ClaimStatus = Literal["EXTRACTED", "INFERRED", "AMBIGUOUS"]
ReviewStatus = Literal["pending", "accepted", "rejected"]
DistillMode = Literal["heuristic", "llm", "hybrid"]
DistillSource = Literal["llm", "heuristic"]
DocumentType = Literal["prd", "proposal", "retrospective", "reply_draft", "weekly_report", "notes", "generic"]
FeedbackLabel = Literal["像我", "不太像", "太保守", "逻辑不对"]
PatchQueueSourceFeedback = Literal["像我", "不太像", "太保守", "逻辑不对", "自动实验"]
ValidationRunKind = Literal["single", "benchmark_base", "benchmark_candidate"]
EvalJobKind = Literal["benchmark_suite", "patch_compare"]
EvalJobStatus = Literal["queued", "running", "completed", "failed"]
PatchQueueStatus = Literal["pending", "applied", "dismissed"]


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class DistillRequest(BaseModel):
    mode: DistillMode = "llm"


class PreviewRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)
    profile_override: Optional["ProfileSections"] = None
    persist_run: bool = False
    run_kind: ValidationRunKind = "single"
    source_patch_id: Optional[str] = None


class PreviewFeedbackRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)
    response: str = Field(min_length=1, max_length=8000)
    feedback: FeedbackLabel
    feedback_note: str = Field(default="", max_length=2000)


class DocumentLinkImportRequest(BaseModel):
    url: str = Field(min_length=1, max_length=4000)


class ProjectSummary(BaseModel):
    id: str
    name: str
    created_at: datetime


class DocumentSummary(BaseModel):
    id: str
    filename: str
    media_type: str
    document_type: DocumentType
    created_at: datetime
    normalized_preview: str


class DocumentDetail(DocumentSummary):
    normalized_text: str


class ClaimSummary(BaseModel):
    id: str
    type: ClaimType
    statement: str
    confidence: float
    status: ClaimStatus
    evidence_text: str
    source_document_id: str
    review_status: ReviewStatus = "pending"
    selected: bool = True
    notes: str = ""
    distill_source: Optional[DistillSource] = None


class ProfileSections(BaseModel):
    identity: list[str] = Field(default_factory=list)
    principles: list[str] = Field(default_factory=list)
    decision_rules: list[str] = Field(default_factory=list)
    workflows: list[str] = Field(default_factory=list)
    voice: list[str] = Field(default_factory=list)
    boundaries: list[str] = Field(default_factory=list)
    output_patterns: list[str] = Field(default_factory=list)
    uncertainty_policy: list[str] = Field(default_factory=list)


class ProfileUpdate(BaseModel):
    identity: list[str] = Field(default_factory=list)
    principles: list[str] = Field(default_factory=list)
    decision_rules: list[str] = Field(default_factory=list)
    workflows: list[str] = Field(default_factory=list)
    voice: list[str] = Field(default_factory=list)
    boundaries: list[str] = Field(default_factory=list)
    output_patterns: list[str] = Field(default_factory=list)
    uncertainty_policy: list[str] = Field(default_factory=list)


class ClaimUpdate(BaseModel):
    review_status: Optional[ReviewStatus] = None
    selected: Optional[bool] = None
    notes: Optional[str] = None


class ClaimCreate(BaseModel):
    id: Optional[str] = None
    type: ClaimType
    statement: str = Field(min_length=1, max_length=500)
    confidence: float = 0.72
    status: ClaimStatus = "INFERRED"
    evidence_text: str = Field(min_length=1, max_length=2000)
    source_document_id: str = Field(min_length=1, max_length=120)
    review_status: ReviewStatus = "accepted"
    selected: bool = True
    notes: str = ""


class ExportedFile(BaseModel):
    filename: str
    relative_path: str
    content: str


class DistillationMeta(BaseModel):
    mode: Optional[DistillMode] = None
    llm_configured: bool = False
    llm_used: bool = False
    llm_error: Optional[str] = None
    invalid_claims_dropped: int = 0
    invalid_claim_examples: list[str] = Field(default_factory=list)
    last_run_at: Optional[datetime] = None


class BenchmarkTask(BaseModel):
    id: str
    title: str = Field(min_length=1, max_length=120)
    scenario: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)
    source_hint: str = Field(default="", max_length=240)
    generated_at: Optional[datetime] = None


class ValidationRunRecord(BaseModel):
    id: str
    kind: ValidationRunKind
    created_at: datetime
    scenario: str
    prompt: str
    response: str
    llm_used: bool = False
    warnings: list[str] = Field(default_factory=list)
    source_patch_id: Optional[str] = None


class PatchExperimentTaskResult(BaseModel):
    task_id: str
    task_title: str
    baseline_response: str
    candidate_response: str
    winner: Literal["baseline", "candidate", "tie"]
    rationale: str
    baseline_score: int = Field(ge=1, le=5)
    candidate_score: int = Field(ge=1, le=5)


class PatchExperimentResult(BaseModel):
    id: str
    created_at: datetime
    baseline_wins: int = 0
    candidate_wins: int = 0
    ties: int = 0
    score_delta: int = 0
    task_results: list[PatchExperimentTaskResult] = Field(default_factory=list)


class EvalJob(BaseModel):
    id: str
    kind: EvalJobKind
    status: EvalJobStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    patch_queue_item_id: Optional[str] = None
    title: str
    total_steps: int = 0
    completed_steps: int = 0
    summary: Optional[str] = None
    error: Optional[str] = None


class PatchQueueItem(BaseModel):
    id: str
    created_at: datetime
    status: PatchQueueStatus = "pending"
    source_feedback: PatchQueueSourceFeedback
    source_feedback_note: str = ""
    source_prompt: str
    source_scenario: str
    source_response_excerpt: str
    suggestion: "PreviewSuggestion"
    experiment_result: Optional[PatchExperimentResult] = None
    applied_at: Optional[datetime] = None
    dismissed_at: Optional[datetime] = None


class PatchQueueSourceInput(BaseModel):
    source_feedback: PatchQueueSourceFeedback
    source_feedback_note: str = ""
    source_prompt: str
    source_scenario: str
    source_response_excerpt: str


class PatchQueueUpsertEntry(BaseModel):
    suggestion: "PreviewSuggestion"
    source: PatchQueueSourceInput


class ExperimentState(BaseModel):
    validation_history: list[ValidationRunRecord] = Field(default_factory=list)
    patch_queue: list[PatchQueueItem] = Field(default_factory=list)
    eval_jobs: list[EvalJob] = Field(default_factory=list)


class ExperimentMutationResponse(BaseModel):
    state: ExperimentState
    message: str


class ExperimentPatchQueueUpsertRequest(BaseModel):
    entries: list[PatchQueueUpsertEntry] = Field(default_factory=list)


class ExperimentStateImportRequest(BaseModel):
    validation_history: list[ValidationRunRecord] = Field(default_factory=list)
    patch_queue: list[PatchQueueItem] = Field(default_factory=list)
    eval_jobs: list[EvalJob] = Field(default_factory=list)


class ProjectDetail(ProjectSummary):
    documents: list[DocumentSummary] = Field(default_factory=list)
    claims: list[ClaimSummary] = Field(default_factory=list)
    profile: Optional[ProfileSections] = None
    benchmark_tasks: list[BenchmarkTask] = Field(default_factory=list)
    exported_files: list[ExportedFile] = Field(default_factory=list)
    distillation_meta: Optional[DistillationMeta] = None


class DistillResponse(BaseModel):
    project: ProjectDetail
    stats: dict[str, Any]
    mode: DistillMode
    llm_used: bool = False
    llm_error: Optional[str] = None


class PreviewReasonTrace(BaseModel):
    principles: list[str] = Field(default_factory=list)
    workflows: list[str] = Field(default_factory=list)
    boundaries: list[str] = Field(default_factory=list)
    voice: list[str] = Field(default_factory=list)


class PreviewResponse(BaseModel):
    response: str
    reason_trace: PreviewReasonTrace
    warnings: list[str] = Field(default_factory=list)
    llm_used: bool = False
    llm_error: Optional[str] = None


class PreviewSuggestion(BaseModel):
    id: str
    section: Literal["principles", "decision_rules", "workflows", "voice", "boundaries"]
    title: str
    suggested_text: str
    reason: str
    target_claim_ids: list[str] = Field(default_factory=list)


class PreviewFeedbackResponse(BaseModel):
    summary: str
    suggestions: list[PreviewSuggestion] = Field(default_factory=list)
    llm_used: bool = False
    llm_error: Optional[str] = None


class PreviewCompareRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)
    baseline_response: str = Field(min_length=1, max_length=8000)
    candidate_response: str = Field(min_length=1, max_length=8000)


class PreviewCompareResponse(BaseModel):
    winner: Literal["baseline", "candidate", "tie"]
    rationale: str
    baseline_score: int = Field(ge=1, le=5)
    candidate_score: int = Field(ge=1, le=5)
    llm_used: bool = False
    llm_error: Optional[str] = None


class ExportResponse(BaseModel):
    project: ProjectDetail
    export_root: str


PreviewRequest.model_rebuild()
PatchQueueItem.model_rebuild()
PatchQueueUpsertEntry.model_rebuild()
