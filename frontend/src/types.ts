export type ClaimType =
  | 'identity'
  | 'principle'
  | 'preference'
  | 'decision_rule'
  | 'workflow'
  | 'voice_pattern'
  | 'boundary'
  | 'artifact_pattern'

export type DistillMode = 'heuristic' | 'llm' | 'hybrid'
export type DocumentType =
  | 'prd'
  | 'proposal'
  | 'retrospective'
  | 'reply_draft'
  | 'weekly_report'
  | 'notes'
  | 'generic'

export interface DocumentSummary {
  id: string
  filename: string
  media_type: string
  document_type: DocumentType
  created_at: string
  normalized_preview: string
}

export interface DocumentDetail extends DocumentSummary {
  normalized_text: string
}

export type DistillSource = 'llm' | 'heuristic'

export interface ClaimSummary {
  id: string
  type: ClaimType
  statement: string
  confidence: number
  status: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'
  evidence_text: string
  source_document_id: string
  review_status: 'pending' | 'accepted' | 'rejected'
  selected: boolean
  notes: string
  /** 蒸馏来源；旧数据可能为空 */
  distill_source?: DistillSource | null
}

export interface ProfileSections {
  identity: string[]
  principles: string[]
  decision_rules: string[]
  workflows: string[]
  voice: string[]
  boundaries: string[]
  output_patterns: string[]
  uncertainty_policy: string[]
}

export interface ExportedFile {
  filename: string
  relative_path: string
  content: string
}

export interface DistillationMeta {
  mode: DistillMode | null
  llm_configured: boolean
  llm_used: boolean
  llm_error: string | null
  invalid_claims_dropped: number
  invalid_claim_examples: string[]
  last_run_at: string | null
}

export interface ProjectSummary {
  id: string
  name: string
  created_at: string
}

export interface ProjectDetail {
  id: string
  name: string
  created_at: string
  documents: DocumentSummary[]
  claims: ClaimSummary[]
  profile: ProfileSections | null
  benchmark_tasks: BenchmarkTask[]
  exported_files: ExportedFile[]
  distillation_meta: DistillationMeta | null
}

export interface DistillResponse {
  project: ProjectDetail
  stats: Record<string, number>
  mode: DistillMode
  llm_used: boolean
  llm_error: string | null
}

export interface PreviewReasonTrace {
  principles: string[]
  workflows: string[]
  boundaries: string[]
  voice: string[]
}

export interface PreviewRunResponse {
  response: string
  reason_trace: PreviewReasonTrace
  warnings: string[]
  llm_used: boolean
  llm_error: string | null
}

export interface PreviewCompareResponse {
  winner: 'baseline' | 'candidate' | 'tie'
  rationale: string
  baseline_score: number
  candidate_score: number
  llm_used: boolean
  llm_error: string | null
}

export interface PreviewSuggestion {
  id: string
  section: 'principles' | 'decision_rules' | 'workflows' | 'voice' | 'boundaries'
  title: string
  suggested_text: string
  reason: string
  target_claim_ids: string[]
}

export interface PreviewFeedbackResponse {
  summary: string
  suggestions: PreviewSuggestion[]
  llm_used: boolean
  llm_error: string | null
}

/** 从试运行反馈加入规则草稿后，用于在编辑页高亮刚插入的条文 */
export type ProfileDraftHighlight = {
  section: PreviewSuggestion['section']
  snippet: string
}

export type ProfileChangeSourceKind =
  | 'manual'
  | 'preview_feedback'
  | 'claims_candidate'
  | 'claims_rebuild'
  | 'distill'

/** 当前草稿最近一次变动来源，用于帮助用户理解“这版是怎么来的” */
export interface ProfileDraftChangeMeta {
  source_kind: ProfileChangeSourceKind
  title: string
  detail: string
  updated_at: string
  section?: keyof ProfileSections | PreviewSuggestion['section']
}

/** 最近一次已生效版本的元信息 */
export interface SavedProfileVersionMeta {
  source_kind: ProfileChangeSourceKind
  title: string
  detail: string
  updated_at: string
}

/** 上一版已保存规则快照，用于在验证页做当前版对比 */
export interface ProfileSavedSnapshot {
  saved_at: string
  profile: ProfileSections
}

export interface ValidationRunRecord {
  id: string
  kind: 'single' | 'benchmark_base' | 'benchmark_candidate'
  created_at: string
  scenario: string
  prompt: string
  response: string
  llm_used: boolean
  warnings: string[]
  source_patch_id?: string | null
}

export interface BenchmarkTask {
  id: string
  title: string
  scenario: string
  prompt: string
  source_hint: string
  generated_at: string | null
}

export interface PatchExperimentTaskResult {
  task_id: string
  task_title: string
  baseline_response: string
  candidate_response: string
  winner: 'baseline' | 'candidate' | 'tie'
  rationale: string
  baseline_score: number
  candidate_score: number
}

export interface PatchExperimentResult {
  id: string
  created_at: string
  baseline_wins: number
  candidate_wins: number
  ties: number
  score_delta: number
  task_results: PatchExperimentTaskResult[]
}

export type EvalJobKind = 'benchmark_suite' | 'patch_compare'
export type EvalJobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface EvalJob {
  id: string
  kind: EvalJobKind
  status: EvalJobStatus
  created_at: string
  started_at: string | null
  finished_at: string | null
  patch_queue_item_id: string | null
  title: string
  total_steps: number
  completed_steps: number
  summary: string | null
  error: string | null
}

export interface ExperimentState {
  validation_history: ValidationRunRecord[]
  patch_queue: PatchQueueItem[]
  eval_jobs: EvalJob[]
}

export interface ExperimentMutationResponse {
  state: ExperimentState
  message: string
}

export interface PatchQueueItem {
  id: string
  created_at: string
  status: 'pending' | 'applied' | 'dismissed'
  source_feedback: '像我' | '不太像' | '太保守' | '逻辑不对' | '自动实验'
  source_feedback_note: string
  source_prompt: string
  source_scenario: string
  source_response_excerpt: string
  suggestion: PreviewSuggestion
  experiment_result: PatchExperimentResult | null
  applied_at?: string | null
  dismissed_at?: string | null
}

export interface ExportResponse {
  project: ProjectDetail
  export_root: string
}

export interface ClaimUpdate {
  review_status?: 'pending' | 'accepted' | 'rejected'
  selected?: boolean
  notes?: string
}

export interface ClaimCreate {
  id?: string
  type: ClaimType
  statement: string
  confidence?: number
  status?: 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS'
  evidence_text: string
  source_document_id: string
  review_status?: 'pending' | 'accepted' | 'rejected'
  selected?: boolean
  notes?: string
}

export interface HealthResponse {
  status: string
  llm_configured: boolean
}
