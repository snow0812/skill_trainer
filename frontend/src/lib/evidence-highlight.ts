/**
 * 在全文里定位与 evidence 对应的片段，支持精确匹配与按词间空白宽松匹配。
 */
export function findEvidenceSpan(
  fullText: string,
  evidence: string,
): { start: number; length: number } | null {
  const trimmed = evidence.trim()
  if (!trimmed) return null

  const exact = fullText.indexOf(trimmed)
  if (exact >= 0) {
    return { start: exact, length: trimmed.length }
  }

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = escaped.join('\\s+')
  const re = new RegExp(pattern, 'm')
  const match = fullText.match(re)
  if (match && match.index !== undefined) {
    return { start: match.index, length: match[0].length }
  }

  const short = words.slice(0, Math.min(words.length, 12)).join(' ')
  if (short.length < 12) return null
  const shortRe = new RegExp(
    short
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s+'),
    'm',
  )
  const m2 = fullText.match(shortRe)
  if (m2 && m2.index !== undefined) {
    return { start: m2.index, length: m2[0].length }
  }

  return null
}
