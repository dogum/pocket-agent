// Render an artifact as Markdown for the export action and any future
// "share as text" affordance. Best-effort: charts and maps degrade to a
// short prose summary because they don't make sense as Markdown.

import type { Artifact, ArtifactComponent } from '@shared/index'

export function artifactToMarkdown(artifact: Artifact): string {
  const lines: string[] = []
  const { header } = artifact

  lines.push(`**${header.label}**`)
  lines.push(`# ${header.title}`)
  if (header.summary) lines.push(`*${header.summary}*`)
  lines.push('')

  for (const c of artifact.components) {
    lines.push(componentToMarkdown(c))
    lines.push('')
  }

  if (artifact.actions && artifact.actions.length > 0) {
    lines.push('---')
    lines.push(
      '**Actions:** ' + artifact.actions.map((a) => a.label).join(' · '),
    )
  }

  return lines.join('\n').trim() + '\n'
}

function componentToMarkdown(c: ArtifactComponent): string {
  switch (c.type) {
    case 'paragraph':
      return c.text
    case 'heading':
      return c.level === 3 ? `### ${c.text}` : `## ${c.text}`
    case 'markdown':
      return c.content
    case 'data_row':
      return c.cells
        .map((cell) =>
          [`**${cell.value}**`, cell.label, cell.trend ? `(${cell.trend})` : '']
            .filter(Boolean)
            .join(' '),
        )
        .join('  ·  ')
    case 'key_value_list':
      return c.items.map((it) => `- **${it.key}:** ${it.value}`).join('\n')
    case 'sparkline': {
      const labels = c.labels?.length === c.values.length ? c.labels : null
      return labels
        ? labels.map((l, i) => `${l}: ${c.values[i]}`).join(' · ')
        : c.values.join(' · ')
    }
    case 'line_chart':
      return c.series
        .map((s) => `${s.name}: ${s.values.join(', ')}`)
        .join('\n')
    case 'bar_chart':
      return c.groups
        .map(
          (g) =>
            `**${g.label}**: ` + g.values.map((v) => `${v.name} ${v.value}`).join(', '),
        )
        .join('\n')
    case 'table': {
      const head = '| ' + c.headers.join(' | ') + ' |'
      const sep = '| ' + c.headers.map(() => '---').join(' | ') + ' |'
      const rows = c.rows.map((r) => '| ' + r.cells.join(' | ') + ' |')
      return [head, sep, ...rows].join('\n')
    }
    case 'quote':
      return `> ${c.text}` + (c.attribution ? `\n> — ${c.attribution}` : '')
    case 'alert':
      return `> **${c.severity.toUpperCase()}${c.title ? ' · ' + c.title : ''}** — ${c.text}`
    case 'timeline':
      return c.segments
        .map(
          (s) =>
            `- **${s.label}** (${s.duration})${s.status ? ` — ${s.status}` : ''}`,
        )
        .join('\n')
    case 'progress':
      return c.items
        .map(
          (it) =>
            `- **${it.label}:** ${it.value}/${it.max} (${Math.round((it.value / it.max) * 100)}%)`,
        )
        .join('\n')
    case 'sources':
      return '*Sources: ' + c.items.join(', ') + '*'
    case 'status_list':
      return c.items
        .map((it) => `- ${it.icon ? it.icon + ' ' : ''}${it.label}: **${it.value}**`)
        .join('\n')
    case 'image':
      return `![${c.caption ?? ''}](${c.url})`
    case 'html_embed':
      return '*[embedded HTML — view in app]*'
    case 'checklist':
      return c.items
        .map((it) => `- [${it.checked ? 'x' : ' '}] ${it.text}`)
        .join('\n')
    case 'comparison': {
      const keys = Array.from(
        new Set(c.items.flatMap((it) => Object.keys(it.metrics))),
      )
      const head = '| Option | ' + keys.join(' | ') + ' |'
      const sep = '| --- | ' + keys.map(() => '---').join(' | ') + ' |'
      const rows = c.items.map(
        (it) =>
          `| ${it.name}${it.highlight ? ' ⭐' : ''} | ` +
          keys.map((k) => String(it.metrics[k] ?? '')).join(' | ') +
          ' |',
      )
      return [head, sep, ...rows].join('\n')
    }
    case 'divider':
      return '---'
    case 'map':
      return `*Map: ${c.center.lat.toFixed(4)}, ${c.center.lng.toFixed(4)} (${c.markers?.length ?? 0} markers)*`
    case 'question_set':
      return c.questions.map((q) => `- **${q.label}**`).join('\n')
    case 'link_preview':
      return `[${c.title ?? c.url}](${c.url})${c.description ? ` — ${c.description}` : ''}`
    default:
      return ''
  }
}
