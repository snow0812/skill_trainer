/** 当前全局忙碌对应的操作，用于顶栏与各按钮展示一致文案。 */
export type StudioLoadingReason =
  | 'init'
  | 'createProject'
  | 'switchProject'
  | 'upload'
  | 'importLink'
  | 'distillFirst'
  | 'distillRedo'
  | 'export'
  | 'saveProfile'
  | 'rebuildProfile'
  | 'claimPatch'
  | 'openDocument'
  | 'runPreview'
  | 'runBenchmarkSuite'
  | 'regenerateBenchmarkTasks'
  | 'benchmarkSuggestions'
  | 'previewFeedback'
  | 'applySuggestion'
  | 'comparePatch'
  | 'comparePatchBatch'

const BANNER_LABEL: Record<StudioLoadingReason, string> = {
  init: '正在加载项目…',
  createProject: '正在创建项目…',
  switchProject: '正在切换项目…',
  upload: '正在上传资料…',
  importLink: '正在导入链接资料…',
  distillFirst: '正在进行首次蒸馏…',
  distillRedo: '正在重新蒸馏并更新规则…',
  export: '正在导出 Skill…',
  saveProfile: '正在保存规则草稿…',
  rebuildProfile: '正在根据已选判断生成规则草稿…',
  claimPatch: '正在更新候选判断…',
  openDocument: '正在打开文档…',
  runPreview: '正在试运行…',
  runBenchmarkSuite: '正在跑自动实验任务集…',
  regenerateBenchmarkTasks: '正在重新生成自动实验任务集…',
  benchmarkSuggestions: '正在根据自动实验结果生成微调建议…',
  previewFeedback: '正在生成微调建议…',
  applySuggestion: '正在把候选写入规则草稿…',
  comparePatch: '正在比较微调建议…',
  comparePatchBatch: '正在批量比较待审微调建议…',
}

export function studioLoadingBannerLabel(reason: StudioLoadingReason): string {
  return BANNER_LABEL[reason]
}
