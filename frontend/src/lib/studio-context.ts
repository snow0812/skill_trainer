import { createContext, useContext } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'

import type {
  BenchmarkTask,
  ClaimSummary,
  ClaimUpdate,
  DistillMode,
  DocumentDetail,
  EvalJob,
  PatchQueueItem,
  ProfileDraftChangeMeta,
  PreviewFeedbackResponse,
  PreviewSuggestion,
  PreviewRunResponse,
  ProfileDraftHighlight,
  ProfileSavedSnapshot,
  ProfileSections,
  ProjectDetail,
  ProjectSummary,
  SavedProfileVersionMeta,
  ValidationRunRecord,
} from '../types'
import type { StudioLoadingReason } from './studio-loading-reasons'

export type { StudioLoadingReason } from './studio-loading-reasons'

export type StudioContextValue = {
  projects: ProjectSummary[]
  activeProjectId: string
  activeProject: ProjectDetail | null
  hasHydratedProjects: boolean
  loading: boolean
  loadingReason: StudioLoadingReason | null
  message: string
  newProjectName: string
  pendingFiles: File[]
  editableProfile: ProfileSections | null
  distillMode: DistillMode
  llmConfigured: boolean
  selectedDocument: DocumentDetail | null
  /** 打开资料抽屉时若带依据片段，用于在正文中高亮并滚动定位 */
  documentEvidenceHighlight: string | null
  /** 反馈建议写入规则草稿后，在对应分区高亮该条文 */
  profileDraftHighlight: ProfileDraftHighlight | null
  /** 当前草稿最近一次变动来源 */
  profileDraftChangeMeta: ProfileDraftChangeMeta | null
  /** 当前已生效版本的元信息 */
  savedProfileVersionMeta: SavedProfileVersionMeta | null
  /** 上一版已保存规则快照，用于在验证页做前后对比 */
  previousSavedProfileSnapshot: ProfileSavedSnapshot | null
  clearProfileDraftHighlight: () => void
  recordProfileDraftManualChange: (section: keyof ProfileSections) => void
  recordProfileDraftClaimCandidateChange: (section: keyof ProfileSections) => void
  previewPrompt: string
  previewScenario: string
  manualPreviewResult: PreviewRunResponse | null
  previewFeedback: PreviewFeedbackResponse | null
  manualPreviewHistory: ValidationRunRecord[]
  benchmarkRunHistory: ValidationRunRecord[]
  patchQueue: PatchQueueItem[]
  evalJobs: EvalJob[]
  benchmarkTasks: BenchmarkTask[]
  queuedRoute: string | null
  clearMessage: () => void
  setNewProjectName: (value: string) => void
  setPendingFiles: (value: File[]) => void
  setEditableProfile: Dispatch<SetStateAction<ProfileSections | null>>
  setDistillMode: (value: DistillMode) => void
  setSelectedDocument: (value: DocumentDetail | null) => void
  setPreviewPrompt: (value: string) => void
  setPreviewScenario: (value: string) => void
  handleCreateProject: (event: FormEvent<HTMLFormElement>) => Promise<void>
  handleSelectProject: (projectId: string) => Promise<void>
  handleUpload: () => Promise<void>
  handleImportDocumentLink: (url: string) => Promise<void>
  handleDistill: () => Promise<void>
  handleExport: () => Promise<void>
  handleSaveProfile: () => Promise<void>
  handleRebuildProfile: () => Promise<void>
  handleClaimPatch: (claimId: string, patch: ClaimUpdate) => Promise<void>
  handleOpenDocument: (documentId: string, evidenceText?: string) => Promise<void>
  handleRunPreview: () => Promise<void>
  handleGeneratePreviewFeedback: (
    feedback: '像我' | '不太像' | '太保守' | '逻辑不对',
    feedbackNote?: string,
  ) => Promise<void>
  handleApplyPreviewSuggestion: (suggestion: PreviewSuggestion) => Promise<void>
  handleApplyPatchQueueItem: (itemId: string) => Promise<void>
  handleDismissPatchQueueItem: (itemId: string) => Promise<void>
  handleComparePatchQueueItem: (itemId: string) => Promise<void>
  handleComparePendingPatches: () => Promise<void>
  handleRunBenchmarkSuite: () => Promise<void>
  handleGenerateBenchmarkSuggestions: () => Promise<void>
  handleRegenerateBenchmarkTasks: () => Promise<void>
  clearQueuedRoute: () => void
}

export const StudioContext = createContext<StudioContextValue | null>(null)

export function useStudio() {
  const context = useContext(StudioContext)
  if (!context) {
    throw new Error('useStudio must be used within StudioProvider')
  }
  return context
}

export function claimGroups(claims: ClaimSummary[]) {
  return [
    { title: '核心原则', claims: claims.filter((claim) => claim.type === 'principle') },
    { title: '决策方式', claims: claims.filter((claim) => claim.type === 'decision_rule') },
    { title: '工作流', claims: claims.filter((claim) => claim.type === 'workflow') },
    {
      title: '输出模板',
      claims: claims.filter((claim) => claim.type === 'artifact_pattern'),
    },
    { title: '表达风格', claims: claims.filter((claim) => claim.type === 'voice_pattern') },
    { title: '边界', claims: claims.filter((claim) => claim.type === 'boundary') },
  ]
}

export type StudioProviderProps = {
  children: ReactNode
}
