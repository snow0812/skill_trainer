import JSZip from 'jszip'

import type { ExportedFile } from '../types'

/** 用于下载文件名的项目名片段，去掉路径非法字符 */
export function safeExportZipBasename(name: string): string {
  const t = name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim()
  return t || 'project'
}

/** 将导出文件打成 zip 并触发浏览器下载，文件名为 `{项目名}_skill.zip` */
export async function downloadExportSkillZip(projectName: string, files: ExportedFile[]): Promise<void> {
  if (files.length === 0) return
  const zip = new JSZip()
  for (const f of files) {
    zip.file(f.filename, f.content)
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeExportZipBasename(projectName)}_skill.zip`
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    URL.revokeObjectURL(url)
  }
}
