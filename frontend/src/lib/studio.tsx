import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  applyExperimentPatch,
  compareExperimentPatch,
  comparePendingExperimentPatches,
  createClaim,
  createProject,
  distillProject,
  dismissExperimentPatch,
  exportSkill,
  getDocument,
  getExperimentState,
  getHealth,
  getProject,
  importDocumentLink,
  getPreviewFeedback,
  importLegacyExperimentState,
  listProjects,
  generateBenchmarkSuggestions as generateBenchmarkSuggestionsApi,
  regenerateBenchmarkTasks,
  rebuildProfile,
  runPreview,
  runBenchmarkSuite as runBenchmarkSuiteApi,
  upsertExperimentPatchQueue,
  updateClaim,
  updateProfile,
  uploadDocuments,
} from '../api'
import type {
  ClaimCreate,
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
import { downloadExportSkillZip, safeExportZipBasename } from './export-zip'
import { StudioContext } from './studio-context'
import type { StudioContextValue, StudioProviderProps } from './studio-context'
import type { StudioLoadingReason } from './studio-loading-reasons'

const ACTIVE_PROJECT_STORAGE_KEY = 'studio-active-project-id'
const PROFILE_VERSION_META_PREFIX = 'studio-profile-version-meta:'
const PROFILE_PREVIOUS_SNAPSHOT_PREFIX = 'studio-profile-previous-snapshot:'
const VALIDATION_HISTORY_PREFIX = 'studio-validation-history:'
const PATCH_QUEUE_PREFIX = 'studio-patch-queue:'
const EVAL_JOBS_PREFIX = 'studio-eval-jobs:'

function readStoredActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeActiveProjectIdToStorage(projectId: string) {
  try {
    if (projectId) {
      localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, projectId)
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

export function StudioProvider({ children }: StudioProviderProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>('')
  const [activeProject, setActiveProject] = useState<ProjectDetail | null>(null)
  const [hasHydratedProjects, setHasHydratedProjects] = useState(false)
  const [newProjectName, setNewProjectName] = useState('我的个人操作系统')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [loadingReason, setLoadingReason] = useState<StudioLoadingReason | null>(null)
  const [message, setMessage] = useState('')
  const loading = loadingReason !== null
  const [editableProfile, setEditableProfile] = useState<ProfileSections | null>(null)
  const [distillMode, setDistillMode] = useState<DistillMode>('llm')
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<DocumentDetail | null>(null)
  const [documentEvidenceHighlight, setDocumentEvidenceHighlight] = useState<string | null>(null)
  const [previewPrompt, setPreviewPrompt] = useState('')
  const [previewScenario, setPreviewScenario] = useState('写回复')
  const [manualPreviewResult, setManualPreviewResult] = useState<PreviewRunResponse | null>(null)
  const [previewFeedback, setPreviewFeedback] = useState<PreviewFeedbackResponse | null>(null)
  const [queuedRoute, setQueuedRoute] = useState<string | null>(null)
  const [profileDraftHighlight, setProfileDraftHighlight] = useState<ProfileDraftHighlight | null>(null)
  const [profileDraftChangeMeta, setProfileDraftChangeMeta] = useState<ProfileDraftChangeMeta | null>(null)
  const [savedProfileVersionMeta, setSavedProfileVersionMeta] = useState<SavedProfileVersionMeta | null>(null)
  const [previousSavedProfileSnapshot, setPreviousSavedProfileSnapshot] = useState<ProfileSavedSnapshot | null>(null)
  const [manualPreviewHistory, setManualPreviewHistory] = useState<ValidationRunRecord[]>([])
  const [benchmarkRunHistory, setBenchmarkRunHistory] = useState<ValidationRunRecord[]>([])
  const [patchQueue, setPatchQueue] = useState<PatchQueueItem[]>([])
  const [evalJobs, setEvalJobs] = useState<EvalJob[]>([])
  const benchmarkTasks = activeProject?.benchmark_tasks ?? []

  const clearMessage = useCallback(() => setMessage(''), [])
  const clearProfileDraftHighlight = useCallback(() => setProfileDraftHighlight(null), [])
  const recordProfileDraftManualChange = useCallback((section: keyof ProfileSections) => {
    setProfileDraftChangeMeta({
      source_kind: 'manual',
      title: '手动编辑规则草稿',
      detail: `你刚手动修改了${profileSectionLabel(section)}分区；保存后才会成为新的生效版本。`,
      updated_at: new Date().toISOString(),
      section,
    })
  }, [])
  const recordProfileDraftClaimCandidateChange = useCallback((section: keyof ProfileSections) => {
    setProfileDraftChangeMeta({
      source_kind: 'claims_candidate',
      title: '最近改动来自候选判断改写',
      detail: `你刚把一条候选判断写进了${profileSectionLabel(section)}分区；保存后才会成为新的生效版本。`,
      updated_at: new Date().toISOString(),
      section,
    })
  }, [])

  useEffect(() => {
    void loadProjects()
    void loadHealth()
  }, [])

  /** 仅在切换项目时同步表单；同项目内 claim 等更新不应覆盖未保存的规则草稿 */
  useEffect(() => {
    setEditableProfile(activeProject?.profile ?? null)
    setProfileDraftChangeMeta(null)
    setProfileDraftHighlight(null)
    if (!activeProject) {
      setSavedProfileVersionMeta(null)
      setPreviousSavedProfileSnapshot(null)
      setManualPreviewHistory([])
      setBenchmarkRunHistory([])
      setPatchQueue([])
      setEvalJobs([])
      return
    }
    setSavedProfileVersionMeta(
      readProfileVersionMeta(activeProject.id) ?? deriveSavedProfileVersionMeta(activeProject),
    )
    setPreviousSavedProfileSnapshot(readProfilePreviousSnapshot(activeProject.id))
    void hydrateExperimentState(activeProject.id)
  }, [activeProject?.id])

  useEffect(() => {
    setManualPreviewResult(null)
    setPreviewFeedback(null)
  }, [activeProject?.id])

  useEffect(() => {
    if (!selectedDocument) {
      setDocumentEvidenceHighlight(null)
    }
  }, [selectedDocument])

  useEffect(() => {
    if (!activeProject?.id) return
    if (!evalJobs.some((job) => job.status === 'queued' || job.status === 'running')) return
    const timer = window.setInterval(() => {
      void refreshExperimentState(activeProject.id)
    }, 2000)
    return () => window.clearInterval(timer)
  }, [activeProject?.id, evalJobs])

  async function refreshExperimentState(projectId: string) {
    const state = await getExperimentState(projectId)
    applyExperimentState(state.validation_history, state.patch_queue, state.eval_jobs)
  }

  function applyExperimentState(
    validationHistory: ValidationRunRecord[],
    nextPatchQueue: PatchQueueItem[],
    nextEvalJobs: EvalJob[],
  ) {
    const splitHistory = splitValidationHistory(validationHistory)
    setManualPreviewHistory(splitHistory.manual)
    setBenchmarkRunHistory(splitHistory.benchmark)
    setPatchQueue(nextPatchQueue)
    setEvalJobs(nextEvalJobs)
  }

  async function hydrateExperimentState(projectId: string) {
    try {
      const state = await getExperimentState(projectId)
      const legacyHistory = readValidationHistory(projectId)
      const legacyPatchQueue = readPatchQueue(projectId)
      const legacyEvalJobs = readEvalJobs(projectId)
      const hasLegacyState = legacyHistory.length > 0 || legacyPatchQueue.length > 0 || legacyEvalJobs.length > 0
      const hasBackendState =
        state.validation_history.length > 0 || state.patch_queue.length > 0 || state.eval_jobs.length > 0
      if (!hasBackendState && hasLegacyState) {
        const imported = await importLegacyExperimentState(projectId, {
          validation_history: legacyHistory,
          patch_queue: legacyPatchQueue,
          eval_jobs: legacyEvalJobs,
        })
        applyExperimentState(
          imported.state.validation_history,
          imported.state.patch_queue,
          imported.state.eval_jobs,
        )
        setMessage(imported.message)
        return
      }
      applyExperimentState(state.validation_history, state.patch_queue, state.eval_jobs)
    } catch (error) {
      setMessage(readError(error))
    }
  }

  async function loadProjects() {
    setLoadingReason('init')
    try {
      const projectList = await listProjects()
      setProjects(projectList)
      if (projectList[0]) {
        const stored = readStoredActiveProjectId()
        const preferred =
          stored && projectList.some((item) => item.id === stored) ? stored : projectList[0].id
        setActiveProjectId(preferred)
        writeActiveProjectIdToStorage(preferred)
        const detail = await getProject(preferred)
        setActiveProject(detail)
        setMessage('')
      } else {
        setActiveProjectId('')
        writeActiveProjectIdToStorage('')
        setActiveProject(null)
        setMessage('先创建一个项目，再上传你的资料。')
      }
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setHasHydratedProjects(true)
      setLoadingReason(null)
    }
  }

  async function loadHealth() {
    try {
      const health = await getHealth()
      setLlmConfigured(health.llm_configured)
    } catch {
      setLlmConfigured(false)
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newProjectName.trim()) return
    setLoadingReason('createProject')
    try {
      const detail = await createProject(newProjectName.trim())
      setProjects((current) => [detail, ...current])
      setActiveProjectId(detail.id)
      writeActiveProjectIdToStorage(detail.id)
      setActiveProject(detail)
      setQueuedRoute('/materials')
      setMessage('项目已创建，可以开始上传资料。')
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleSelectProject(projectId: string) {
    setActiveProjectId(projectId)
    writeActiveProjectIdToStorage(projectId)
    setLoadingReason('switchProject')
    try {
      const detail = await getProject(projectId)
      setActiveProject(detail)
      setSelectedDocument(null)
      setManualPreviewResult(null)
      setPreviewFeedback(null)
      setQueuedRoute(null)
      setMessage(`已切换到项目：${detail.name}`)
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleUpload() {
    if (!activeProject || pendingFiles.length === 0) return
    setLoadingReason('upload')
    try {
      const detail = await uploadDocuments(activeProject.id, pendingFiles)
      setActiveProject(detail)
      setPendingFiles([])
      setQueuedRoute('/materials')
      setMessage(`已上传 ${detail.documents.length} 份资料。`)
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleImportDocumentLink(url: string) {
    if (!activeProject || !url.trim()) return
    setLoadingReason('importLink')
    try {
      const detail = await importDocumentLink(activeProject.id, url.trim())
      setActiveProject(detail)
      setQueuedRoute('/materials')
      setMessage(`已导入链接资料，当前共有 ${detail.documents.length} 份材料。`)
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleDistill() {
    if (!activeProject) return
    const isFirstDistill = activeProject.claims.length === 0
    setLoadingReason(isFirstDistill ? 'distillFirst' : 'distillRedo')
    try {
      const previousProfile = activeProject.profile
      const response = await distillProject(activeProject.id, distillMode)
      persistPreviousProfileSnapshot(activeProject.id, previousProfile)
      const nextVersionMeta: SavedProfileVersionMeta = {
        source_kind: 'distill',
        title: '最近生效版本来自重新蒸馏',
        detail: `系统基于资料重新生成了规则草稿；后续验证将使用这版已保存规则。`,
        updated_at: new Date().toISOString(),
      }
      setActiveProject(response.project)
      setEditableProfile(response.project.profile ?? null)
      setProfileDraftHighlight(null)
      setProfileDraftChangeMeta(null)
      setSavedProfileVersionMeta(nextVersionMeta)
      setPreviousSavedProfileSnapshot(readProfilePreviousSnapshot(activeProject.id))
      writeProfileVersionMeta(activeProject.id, nextVersionMeta)
      setQueuedRoute('/summary')
      setMessage(
        response.llm_used
          ? `已完成 ${response.mode} 蒸馏：生成 ${response.stats.final_claims ?? response.stats.claims} 条规则，当前结果来自 LLM 蒸馏。`
          : `已完成 ${response.mode} 蒸馏：生成 ${response.stats.final_claims ?? response.stats.claims} 条规则。`,
      )
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleExport() {
    if (!activeProject) return
    setLoadingReason('export')
    try {
      const response = await exportSkill(activeProject.id)
      setActiveProject(response.project)
      setQueuedRoute('/release/exports')
      const base = `已按当前已保存规则草稿导出 Skill 到 ${response.export_root}`
      try {
        await downloadExportSkillZip(response.project.name, response.project.exported_files)
        setMessage(`${base}；已下载 ${safeExportZipBasename(response.project.name)}_skill.zip`)
      } catch {
        setMessage(`${base}。本地 ZIP 下载未成功，可在「导出结果」页查看已生成文件。`)
      }
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleSaveProfile() {
    if (!activeProject || !editableProfile) return
    setLoadingReason('saveProfile')
    try {
      const previousProfile = activeProject.profile
      const detail = await updateProfile(activeProject.id, editableProfile)
      persistPreviousProfileSnapshot(activeProject.id, previousProfile)
      const nextVersionMeta: SavedProfileVersionMeta = toSavedVersionMeta(profileDraftChangeMeta)
      setActiveProject(detail)
      setEditableProfile(detail.profile ?? null)
      setProfileDraftHighlight(null)
      setProfileDraftChangeMeta(null)
      setSavedProfileVersionMeta(nextVersionMeta)
      setPreviousSavedProfileSnapshot(readProfilePreviousSnapshot(activeProject.id))
      writeProfileVersionMeta(activeProject.id, nextVersionMeta)
      setQueuedRoute('/validation/manual')
      setMessage('规则草稿已保存；后续验证、反馈与导出都会基于这版已保存规则运行。')
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleRebuildProfile() {
    if (!activeProject) return
    setLoadingReason('rebuildProfile')
    try {
      const previousProfile = activeProject.profile
      const response = await rebuildProfile(activeProject.id)
      persistPreviousProfileSnapshot(activeProject.id, previousProfile)
      const nextVersionMeta: SavedProfileVersionMeta = {
        source_kind: 'claims_rebuild',
        title: '最近生效版本来自候选判断重建',
        detail: `系统根据你当前标记为候选的判断重组出一版规则草稿。`,
        updated_at: new Date().toISOString(),
      }
      setActiveProject(response.project)
      setEditableProfile(response.project.profile ?? null)
      setProfileDraftHighlight(null)
      setProfileDraftChangeMeta(null)
      setSavedProfileVersionMeta(nextVersionMeta)
      setPreviousSavedProfileSnapshot(readProfilePreviousSnapshot(activeProject.id))
      writeProfileVersionMeta(activeProject.id, nextVersionMeta)
      setQueuedRoute('/validation/manual')
      setMessage(
        `已根据你保留的候选判断生成一版规则草稿，纳入 ${response.stats.claims_considered ?? 0} 条有效规则。`,
      )
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleClaimPatch(claimId: string, patch: ClaimUpdate) {
    if (!activeProject) return
    setLoadingReason('claimPatch')
    try {
      const detail = await updateClaim(activeProject.id, claimId, patch)
      setActiveProject(detail)
      setMessage('候选判断状态已更新。')
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleOpenDocument(documentId: string, evidenceText?: string) {
    if (!activeProject || !documentId) return
    setLoadingReason('openDocument')
    try {
      const detail = await getDocument(activeProject.id, documentId)
      setSelectedDocument(detail)
      const slice = evidenceText?.trim()
      setDocumentEvidenceHighlight(slice && slice.length > 0 ? slice : null)
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleRunPreview() {
    if (!activeProject || !previewPrompt.trim()) return
    setLoadingReason('runPreview')
    try {
      const result = await runPreview(activeProject.id, previewScenario, previewPrompt.trim(), undefined, {
        persistRun: true,
        runKind: 'single',
      })
      await refreshExperimentState(activeProject.id)
      setManualPreviewResult(result)
      setPreviewFeedback(null)
      setQueuedRoute('/validation/feedback')
      setMessage(
        result.llm_used
          ? '已完成一次真实试运行；这次输出基于当前已保存规则草稿。你可以直接判断它像不像你。'
          : `已完成一次本地试运行。${result.llm_error ? `本次未使用 LLM：${result.llm_error}` : ''}`,
      )
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleGeneratePreviewFeedback(
    feedback: '像我' | '不太像' | '太保守' | '逻辑不对',
    feedbackNote = '',
  ) {
    if (!activeProject || !previewPrompt.trim() || !manualPreviewResult?.response) return
    setLoadingReason('previewFeedback')
    try {
      const result = await getPreviewFeedback(
        activeProject.id,
        previewScenario,
        previewPrompt.trim(),
        manualPreviewResult.response,
        feedback,
        feedbackNote,
      )
      const mutation = await upsertExperimentPatchQueue(activeProject.id, {
        entries: result.suggestions.map((suggestion) => ({
          suggestion,
          source: {
            source_feedback: feedback,
            source_feedback_note: feedbackNote,
            source_prompt: previewPrompt.trim(),
            source_scenario: previewScenario,
            source_response_excerpt: manualPreviewResult.response.slice(0, 220),
          },
        })),
      })
      applyExperimentState(
        mutation.state.validation_history,
        mutation.state.patch_queue,
        mutation.state.eval_jobs,
      )
      setPreviewFeedback(result)
      setMessage(
        result.llm_used
          ? '已生成一组微调建议，并同步加入微调建议池。'
          : `已生成本地微调建议，并同步加入微调建议池。${result.llm_error ? `本次未使用 LLM：${result.llm_error}` : ''}`,
      )
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleApplyPreviewSuggestion(suggestion: PreviewSuggestion) {
    if (!activeProject) return
    const claimType = claimTypeFromSuggestionSection(suggestion.section)
    const feedbackEvidence = buildFeedbackEvidence(suggestion)
    setLoadingReason('applySuggestion')
    try {
      let latestProject = activeProject
      if (suggestion.target_claim_ids.length > 0) {
        for (const claimId of suggestion.target_claim_ids) {
          latestProject = await updateClaim(activeProject.id, claimId, {
            selected: false,
            notes: `superseded_by_feedback:${suggestion.id}:${suggestion.suggested_text}`,
          })
        }
      }

      const existingFeedbackClaim = latestProject.claims.find(
        (claim) => claim.id === `feedback-${suggestion.id}`,
      )
      if (!existingFeedbackClaim) {
        latestProject = await createClaim(activeProject.id, {
          id: `feedback-${suggestion.id}`,
          type: claimType,
          statement: suggestion.suggested_text,
          confidence: 0.88,
          status: 'INFERRED',
          evidence_text: feedbackEvidence,
          source_document_id: 'user_feedback',
          review_status: 'accepted',
          selected: true,
          notes: [
            'source:preview_feedback',
            `suggestion:${suggestion.id}`,
            suggestion.target_claim_ids.length
              ? `targets:${suggestion.target_claim_ids.join(',')}`
              : 'targets:none',
          ].join(' | '),
        } satisfies ClaimCreate)
      }

      setActiveProject(latestProject)
      const baseProfile = latestProject.profile
        ? { ...latestProject.profile }
        : emptyProfileSections()
      const mergedProfile = mergePreviewSuggestionIntoProfile(baseProfile, suggestion)
      setEditableProfile(mergedProfile)
      setProfileDraftHighlight({
        section: suggestion.section,
        snippet: suggestion.suggested_text,
      })
      setProfileDraftChangeMeta({
        source_kind: 'preview_feedback',
        title: `最近改动来自试运行反馈：${suggestion.title}`,
        detail: `已把建议写入${profileSectionLabel(suggestion.section)}分区候选；保存后才会成为新的生效版本。`,
        updated_at: new Date().toISOString(),
        section: suggestion.section,
      })
      const mutation = await applyExperimentPatch(activeProject.id, suggestion.id)
      applyExperimentState(
        mutation.state.validation_history,
        mutation.state.patch_queue,
        mutation.state.eval_jobs,
      )
      setMessage(`已将建议写入规则草稿候选，并同步更新候选判断：${suggestion.title}`)
    } catch (error) {
      setMessage(readError(error))
      return
    } finally {
      setLoadingReason(null)
    }
    setQueuedRoute('/correction/profile')
  }

  async function handleApplyPatchQueueItem(itemId: string) {
    const item = patchQueue.find((entry) => entry.id === itemId)
    if (!item) return
    await handleApplyPreviewSuggestion(item.suggestion)
  }

  async function handleDismissPatchQueueItem(itemId: string) {
    if (!activeProject) return
    try {
      const mutation = await dismissExperimentPatch(activeProject.id, itemId)
      applyExperimentState(
        mutation.state.validation_history,
        mutation.state.patch_queue,
        mutation.state.eval_jobs,
      )
      setMessage(mutation.message)
    } catch (error) {
      setMessage(readError(error))
    }
  }

  async function handleRunBenchmarkSuite() {
    if (!activeProject) return
    try {
      const mutation = await runBenchmarkSuiteApi(activeProject.id)
      applyExperimentState(
        mutation.state.validation_history,
        mutation.state.patch_queue,
        mutation.state.eval_jobs,
      )
      setMessage(mutation.message)
    } catch (error) {
      setMessage(readError(error))
    }
  }

  async function handleGenerateBenchmarkSuggestions() {
    if (!activeProject) return
    setLoadingReason('benchmarkSuggestions')
    try {
      const mutation = await generateBenchmarkSuggestionsApi(activeProject.id)
      applyExperimentState(
        mutation.state.validation_history,
        mutation.state.patch_queue,
        mutation.state.eval_jobs,
      )
      setQueuedRoute('/experiments/patches')
      setMessage(mutation.message)
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  async function handleComparePatchQueueItem(itemId: string) {
    if (!activeProject) return
    try {
      const mutation = await compareExperimentPatch(activeProject.id, itemId)
      applyExperimentState(
        mutation.state.validation_history,
        mutation.state.patch_queue,
        mutation.state.eval_jobs,
      )
      setQueuedRoute('/experiments/patches')
      setMessage(mutation.message)
    } catch (error) {
      setMessage(readError(error))
    }
  }

  async function handleComparePendingPatches() {
    if (!activeProject) return
    try {
      const mutation = await comparePendingExperimentPatches(activeProject.id)
      applyExperimentState(
        mutation.state.validation_history,
        mutation.state.patch_queue,
        mutation.state.eval_jobs,
      )
      setQueuedRoute('/experiments/results')
      setMessage(mutation.message)
    } catch (error) {
      setMessage(readError(error))
    }
  }

  async function handleRegenerateBenchmarkTasks() {
    if (!activeProject) return
    setLoadingReason('regenerateBenchmarkTasks')
    try {
      const detail = await regenerateBenchmarkTasks(activeProject.id)
      setActiveProject(detail)
      setMessage(
        detail.benchmark_tasks.length > 0
          ? `已重新生成自动实验任务集，共 ${detail.benchmark_tasks.length} 个任务。`
          : '已重新生成自动实验任务集，但当前还没有可用任务。',
      )
    } catch (error) {
      setMessage(readError(error))
    } finally {
      setLoadingReason(null)
    }
  }

  const value: StudioContextValue = {
    projects,
    activeProjectId,
    activeProject,
    hasHydratedProjects,
    loading,
    loadingReason,
    message,
    newProjectName,
    pendingFiles,
    editableProfile,
    distillMode,
    llmConfigured,
    selectedDocument,
    documentEvidenceHighlight,
    profileDraftHighlight,
    profileDraftChangeMeta,
    savedProfileVersionMeta,
    previousSavedProfileSnapshot,
    clearProfileDraftHighlight,
    recordProfileDraftManualChange,
    recordProfileDraftClaimCandidateChange,
    previewPrompt,
    previewScenario,
    manualPreviewResult,
    previewFeedback,
    manualPreviewHistory,
    benchmarkRunHistory,
    patchQueue,
    evalJobs,
    benchmarkTasks,
    queuedRoute,
    clearMessage,
    handleCreateProject,
    handleUpload,
    handleImportDocumentLink,
    handleDistill,
    handleExport,
    handleSaveProfile,
    handleRebuildProfile,
    handleClaimPatch,
    handleOpenDocument,
    handleRunPreview,
    handleGeneratePreviewFeedback,
    handleApplyPreviewSuggestion,
    handleApplyPatchQueueItem,
    handleDismissPatchQueueItem,
    handleComparePatchQueueItem,
    handleComparePendingPatches,
    handleRunBenchmarkSuite,
    handleGenerateBenchmarkSuggestions,
    handleRegenerateBenchmarkTasks,
    clearQueuedRoute: () => setQueuedRoute(null),
    setNewProjectName,
    setPendingFiles,
    setEditableProfile,
    setDistillMode,
    setSelectedDocument,
    setPreviewPrompt,
    setPreviewScenario,
    handleSelectProject,
  }

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

function readError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return '发生未知错误'
}

function claimTypeFromSuggestionSection(section: PreviewSuggestion['section']) {
  const mapping: Record<PreviewSuggestion['section'], ClaimCreate['type']> = {
    principles: 'principle',
    decision_rules: 'decision_rule',
    workflows: 'workflow',
    voice: 'voice_pattern',
    boundaries: 'boundary',
  }
  return mapping[section]
}

function buildFeedbackEvidence(suggestion: PreviewSuggestion) {
  return [
    `用户通过试运行反馈确认：${suggestion.title}`,
    suggestion.reason,
  ].join(' | ')
}

function emptyProfileSections(): ProfileSections {
  return {
    identity: [],
    principles: [],
    decision_rules: [],
    workflows: [],
    voice: [],
    boundaries: [],
    output_patterns: [],
    uncertainty_policy: [],
  }
}

function mergePreviewSuggestionIntoProfile(
  base: ProfileSections,
  suggestion: PreviewSuggestion,
): ProfileSections {
  const key = suggestion.section
  const existing = base[key] ?? []
  if (existing.includes(suggestion.suggested_text)) {
    return { ...base }
  }
  return {
    ...base,
    [key]: [suggestion.suggested_text, ...existing],
  }
}

function profileSectionLabel(section: keyof ProfileSections | PreviewSuggestion['section']) {
  const mapping: Record<keyof ProfileSections, string> = {
    identity: '身份',
    principles: '原则',
    decision_rules: '决策',
    workflows: '工作流',
    voice: '表达',
    boundaries: '边界',
    output_patterns: '输出模板',
    uncertainty_policy: '不确定性',
  }
  return mapping[section as keyof ProfileSections]
}

function readStorageJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeStorageJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

function readProfileVersionMeta(projectId: string): SavedProfileVersionMeta | null {
  return readStorageJson<SavedProfileVersionMeta>(`${PROFILE_VERSION_META_PREFIX}${projectId}`)
}

function writeProfileVersionMeta(projectId: string, meta: SavedProfileVersionMeta) {
  writeStorageJson(`${PROFILE_VERSION_META_PREFIX}${projectId}`, meta)
}

function readProfilePreviousSnapshot(projectId: string): ProfileSavedSnapshot | null {
  return readStorageJson<ProfileSavedSnapshot>(`${PROFILE_PREVIOUS_SNAPSHOT_PREFIX}${projectId}`)
}

function persistPreviousProfileSnapshot(projectId: string, profile: ProfileSections | null) {
  if (!profile) return
  const snapshot: ProfileSavedSnapshot = {
    saved_at: new Date().toISOString(),
    profile,
  }
  writeStorageJson(`${PROFILE_PREVIOUS_SNAPSHOT_PREFIX}${projectId}`, snapshot)
}

function deriveSavedProfileVersionMeta(project: ProjectDetail): SavedProfileVersionMeta | null {
  if (!project.profile) return null
  if (project.distillation_meta?.last_run_at) {
    return {
      source_kind: 'distill',
      title: '最近生效版本来自最近一次蒸馏',
      detail: '当前没有更近的保存记录时，默认把蒸馏生成视为这版规则的来源。',
      updated_at: project.distillation_meta.last_run_at,
    }
  }
  return {
    source_kind: 'manual',
    title: '最近生效版本已存在',
    detail: '这是当前项目里已保存的规则草稿版本。',
    updated_at: project.created_at,
  }
}

function toSavedVersionMeta(
  draftMeta: ProfileDraftChangeMeta | null,
): SavedProfileVersionMeta {
  if (draftMeta) {
    return {
      source_kind: draftMeta.source_kind,
      title: draftMeta.title.replace('最近改动来自', '最近生效版本来自'),
      detail: draftMeta.detail.replace('保存后才会成为新的生效版本。', '这已经是当前验证与导出使用的版本。'),
      updated_at: new Date().toISOString(),
    }
  }
  return {
    source_kind: 'manual',
    title: '最近生效版本来自手动保存',
    detail: '你手动确认并保存了规则草稿；当前验证与导出都会基于这版规则运行。',
    updated_at: new Date().toISOString(),
  }
}

function readValidationHistory(projectId: string): ValidationRunRecord[] {
  return readStorageJson<ValidationRunRecord[]>(`${VALIDATION_HISTORY_PREFIX}${projectId}`) ?? []
}

function splitValidationHistory(runs: ValidationRunRecord[]) {
  return {
    manual: runs.filter((run) => run.kind === 'single'),
    benchmark: runs.filter((run) => run.kind !== 'single'),
  }
}

function readPatchQueue(projectId: string): PatchQueueItem[] {
  return readStorageJson<PatchQueueItem[]>(`${PATCH_QUEUE_PREFIX}${projectId}`) ?? []
}

function readEvalJobs(projectId: string): EvalJob[] {
  return readStorageJson<EvalJob[]>(`${EVAL_JOBS_PREFIX}${projectId}`) ?? []
}
