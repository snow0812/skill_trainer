import type {
  ClaimCreate,
  ClaimUpdate,
  DistillMode,
  DistillResponse,
  DocumentDetail,
  ExperimentMutationResponse,
  ExperimentState,
  ExportResponse,
  HealthResponse,
  PatchQueueItem,
  PreviewCompareResponse,
  PreviewSuggestion,
  PreviewFeedbackResponse,
  PreviewRunResponse,
  ProfileSections,
  ProjectDetail,
  ProjectSummary,
  ValidationRunRecord,
  EvalJob,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000/api'

function detailToMessage(detail: unknown): string {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: string }).msg)
        }
        return String(item)
      })
      .filter(Boolean)
      .join('；')
  }
  if (typeof detail === 'object' && 'msg' in detail) {
    return String((detail as { msg: string }).msg)
  }
  return String(detail)
}

function humanizeApiError(message: string): string {
  if (
    message.includes('USER_TWIN_LLM') ||
    message.includes('LLM distillation requires') ||
    message.includes('llm_configured')
  ) {
    return '当前蒸馏模式需要大模型：请在运行后端的环境变量中配置 USER_TWIN_LLM_BASE_URL、USER_TWIN_LLM_API_KEY、USER_TWIN_LLM_MODEL（或将侧栏蒸馏模式改为非纯 LLM 的可行选项）。'
  }
  return message
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    const body = await response.text()
    let message = body || '请求失败'
    try {
      const parsed = JSON.parse(body) as { detail?: unknown }
      const extracted = detailToMessage(parsed.detail)
      if (extracted) message = extracted
    } catch {
      /* 非 JSON 时用原始 body */
    }
    throw new Error(humanizeApiError(message))
  }
  return (await response.json()) as T
}

export function listProjects() {
  return request<ProjectSummary[]>('/projects')
}

export function getHealth() {
  return request<HealthResponse>('/health')
}

export function createProject(name: string) {
  return request<ProjectDetail>('/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function getProject(projectId: string) {
  return request<ProjectDetail>(`/projects/${projectId}`)
}

export function uploadDocuments(projectId: string, files: File[]) {
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  return request<ProjectDetail>(`/projects/${projectId}/documents/upload`, {
    method: 'POST',
    body: formData,
  })
}

export function importDocumentLink(projectId: string, url: string) {
  return request<ProjectDetail>(`/projects/${projectId}/documents/import-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

export function distillProject(projectId: string, mode: DistillMode) {
  return request<DistillResponse>(`/projects/${projectId}/distill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
}

export function exportSkill(projectId: string) {
  return request<ExportResponse>(`/projects/${projectId}/export-skill`, {
    method: 'POST',
  })
}

export function updateProfile(projectId: string, profile: ProfileSections) {
  return request<ProjectDetail>(`/projects/${projectId}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
}

export function updateClaim(projectId: string, claimId: string, payload: ClaimUpdate) {
  return request<ProjectDetail>(`/projects/${projectId}/claims/${claimId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function createClaim(projectId: string, payload: ClaimCreate) {
  return request<ProjectDetail>(`/projects/${projectId}/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function rebuildProfile(projectId: string) {
  return request<DistillResponse>(`/projects/${projectId}/rebuild-profile`, {
    method: 'POST',
  })
}

export function runPreview(
  projectId: string,
  scenario: string,
  prompt: string,
  profileOverride?: ProfileSections,
  options?: {
    persistRun?: boolean
    runKind?: 'single' | 'benchmark_base' | 'benchmark_candidate'
    sourcePatchId?: string | null
  },
) {
  return request<PreviewRunResponse>(`/projects/${projectId}/preview-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenario,
      prompt,
      profile_override: profileOverride,
      persist_run: options?.persistRun ?? false,
      run_kind: options?.runKind ?? 'single',
      source_patch_id: options?.sourcePatchId ?? null,
    }),
  })
}

export function getPreviewFeedback(
  projectId: string,
  scenario: string,
  prompt: string,
  response: string,
  feedback: '像我' | '不太像' | '太保守' | '逻辑不对',
  feedbackNote = '',
) {
  return request<PreviewFeedbackResponse>(`/projects/${projectId}/preview-feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, prompt, response, feedback, feedback_note: feedbackNote }),
  })
}

export function getDocument(projectId: string, documentId: string) {
  return request<DocumentDetail>(`/projects/${projectId}/documents/${documentId}`)
}

export function comparePreview(
  projectId: string,
  scenario: string,
  prompt: string,
  baselineResponse: string,
  candidateResponse: string,
) {
  return request<PreviewCompareResponse>(`/projects/${projectId}/preview-compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenario,
      prompt,
      baseline_response: baselineResponse,
      candidate_response: candidateResponse,
    }),
  })
}

export function regenerateBenchmarkTasks(projectId: string) {
  return request<ProjectDetail>(`/projects/${projectId}/benchmark/regenerate`, {
    method: 'POST',
  })
}

export function getExperimentState(projectId: string) {
  return request<ExperimentState>(`/projects/${projectId}/experiments/state`)
}

export function importLegacyExperimentState(
  projectId: string,
  payload: {
    validation_history: ValidationRunRecord[]
    patch_queue: PatchQueueItem[]
    eval_jobs: EvalJob[]
  },
) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/import-legacy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function upsertExperimentPatchQueue(
  projectId: string,
  payload: {
    entries: Array<{
      suggestion: PreviewSuggestion
      source: {
        source_feedback: '像我' | '不太像' | '太保守' | '逻辑不对' | '自动实验'
        source_feedback_note: string
        source_prompt: string
        source_scenario: string
        source_response_excerpt: string
      }
    }>
  },
) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/patch-queue/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function applyExperimentPatch(projectId: string, itemId: string) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/patches/${itemId}/apply`, {
    method: 'POST',
  })
}

export function dismissExperimentPatch(projectId: string, itemId: string) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/patches/${itemId}/dismiss`, {
    method: 'POST',
  })
}

export function runBenchmarkSuite(projectId: string) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/benchmark/run`, {
    method: 'POST',
  })
}

export function generateBenchmarkSuggestions(projectId: string) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/benchmark/suggestions`, {
    method: 'POST',
  })
}

export function compareExperimentPatch(projectId: string, itemId: string) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/patches/${itemId}/compare`, {
    method: 'POST',
  })
}

export function comparePendingExperimentPatches(projectId: string) {
  return request<ExperimentMutationResponse>(`/projects/${projectId}/experiments/patches/compare-pending`, {
    method: 'POST',
  })
}
