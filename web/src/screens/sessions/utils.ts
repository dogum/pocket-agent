import type { Session } from '@shared/index'

export function pluralize(noun: string): string {
  // Vowel-y → ies fails on "day" → "daies" — only consonant-y takes ies.
  if (/[^aeiou]y$/.test(noun)) return noun.slice(0, -1) + 'ies'
  // ch/sh/s/x/z take -es ("dispatch" → "dispatches", "box" → "boxes").
  if (/(?:ch|sh|s|x|z)$/.test(noun)) return noun + 'es'
  return noun + 's'
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function relativeTime(iso: string): string {
  const dt = new Date(iso).getTime()
  const now = Date.now()
  const diff = Math.floor((now - dt) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604_800) return `${Math.floor(diff / 86_400)}d ago`
  return new Date(iso).toLocaleDateString()
}

export function sessionStatusLabel(session: Session): string {
  if (session.archived) return 'archived'
  if (session.run_status === 'streaming') return 'working'
  if (session.run_status === 'requires_action') return 'needs input'
  if (session.run_status === 'error') return 'error'
  return session.status
}

export function sessionStatusTone(
  session: Session,
): 'signal' | 'cool' | 'amber' | 'red' | '' {
  if (session.archived) return ''
  if (session.run_status === 'error') return 'red'
  if (session.run_status === 'requires_action') return 'amber'
  if (session.run_status === 'streaming' || session.status === 'active') return 'signal'
  if (session.status === 'complete') return 'cool'
  return ''
}

export function sessionStage(session: Session): {
  index: number
  label: string
  meter: string[]
} {
  const meter = ['intake', 'draft', 'review', 'ship']
  if (session.archived) return { index: 0, label: 'Archived', meter }
  if (session.status === 'complete') return { index: 3, label: 'Shipped', meter }
  if (session.run_status === 'requires_action') return { index: 2, label: 'Review', meter }
  if (session.run_status === 'streaming') return { index: 1, label: 'Running', meter }
  if (session.ingest_count === 0) return { index: 0, label: 'Intake', meter }
  if (session.artifact_count === 0) return { index: 1, label: 'Draft', meter }
  return { index: 2, label: 'Review', meter }
}
