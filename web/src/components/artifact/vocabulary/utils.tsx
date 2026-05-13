import type { JSX } from 'react'

import type { ThemeColor } from '@shared/index'

export function toneClass(tone?: ThemeColor): string {
  return tone ? ` ${tone}` : ''
}

export function ConfidencePip({
  confidence,
}: {
  confidence?: 'low' | 'medium' | 'high'
}): JSX.Element {
  return (
    <span className={'vocab-confidence ' + (confidence ?? 'medium')}>
      {confidence ?? 'medium'}
    </span>
  )
}

export function EmptyState({ label }: { label: string }): JSX.Element {
  return <div className="vocab-empty">{label}</div>
}

export function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}
