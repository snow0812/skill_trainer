import type { Dispatch, SetStateAction } from 'react'

import type { ClaimSummary, ClaimUpdate, ProfileSections } from '../types'

export function patchProfile(
  setEditableProfile: Dispatch<SetStateAction<ProfileSections | null>>,
  key: keyof ProfileSections,
  value: string[],
) {
  setEditableProfile((current) => (current ? { ...current, [key]: value } : current))
}

export async function handleRewriteClaim(
  claim: ClaimSummary,
  value: string,
  setEditableProfile: Dispatch<SetStateAction<ProfileSections | null>>,
  handleClaimPatch: (claimId: string, patch: ClaimUpdate) => Promise<void>,
  onDraftUpdated?: (section: keyof ProfileSections) => void,
) {
  const sectionKey = claimTypeToProfileKey(claim.type)

  if (sectionKey) {
    setEditableProfile((current) => {
      if (!current) return current
      const existing = current[sectionKey]
      const nextItems = existing.includes(claim.statement)
        ? existing.map((item) => (item === claim.statement ? value : item))
        : [value, ...existing]
      return { ...current, [sectionKey]: dedupe(nextItems) }
    })
  }

  if (sectionKey) {
    onDraftUpdated?.(sectionKey)
  }

  await handleClaimPatch(claim.id, {
    review_status: 'accepted',
    selected: true,
    notes: `rewritten:${value}`,
  })
}

export function claimTypeToProfileKey(type: ClaimSummary['type']): keyof ProfileSections | null {
  const mapping: Partial<Record<ClaimSummary['type'], keyof ProfileSections>> = {
    identity: 'identity',
    principle: 'principles',
    decision_rule: 'decision_rules',
    workflow: 'workflows',
    voice_pattern: 'voice',
    boundary: 'boundaries',
    artifact_pattern: 'output_patterns',
    preference: 'principles',
  }
  return mapping[type] ?? null
}

export function dedupe(items: string[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.trim() || seen.has(item)) return false
    seen.add(item)
    return true
  })
}
