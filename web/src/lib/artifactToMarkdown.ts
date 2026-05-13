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
    case 'calculation': {
      const title = c.label ? `**${c.label}**\n` : ''
      const steps = c.steps
        .map((step, i) => {
          const expr = step.expression ? ` — \`${step.expression}\`` : ''
          return `${i + 1}. ${step.label}${expr}: **${step.value}**`
        })
        .join('\n')
      const result = c.result
        ? `\n\n**${c.result.label}:** ${c.result.value}`
        : ''
      return title + steps + result
    }
    case 'what_if': {
      const inputs = c.inputs
        .map((input) => {
          const choices = input.choices?.length
            ? ` (${input.choices.join(' / ')})`
            : ''
          const unit = input.unit ? ` ${input.unit}` : ''
          return `- **${input.label}:** ${input.value}${unit}${choices}`
        })
        .join('\n')
      const outputs = c.outputs
        .map((output) => `- **${output.label}:** ${output.value}`)
        .join('\n')
      return [
        c.label ? `**${c.label}**` : '**What-if scenario**',
        inputs ? `Inputs:\n${inputs}` : '',
        outputs ? `Outputs:\n${outputs}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    }
    case 'assumption_list':
      return c.items
        .map((it) => {
          const confidence = it.confidence ? ` (${it.confidence} confidence)` : ''
          return `- ${it.text}${confidence}`
        })
        .join('\n')
    case 'confidence_band': {
      const range =
        typeof c.low === 'number' &&
        typeof c.mid === 'number' &&
        typeof c.high === 'number'
          ? ` — range ${c.low} / ${c.mid} / ${c.high}`
          : ''
      const method = c.method ? `\n_${c.method}_` : ''
      return `**${c.label ?? 'Estimate'}:** ${c.value}${c.unit ?? ''}${range}${method}`
    }
    case 'counter_proposal':
      return [
        c.intro ?? '',
        c.segments
          .map((segment) => {
            const state = segment.state ? ` — ${segment.state}` : ''
            const modified = segment.modified_text
              ? `\n  Modified: ${segment.modified_text}`
              : ''
            const rejected = segment.reject_reason
              ? `\n  Reject reason: ${segment.reject_reason}`
              : ''
            return `- **${segment.label}:** ${segment.proposal}${state}${modified}${rejected}`
          })
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'tradeoff_slider':
      return [
        `**${c.question}**`,
        `${c.left.label} ← **${c.value}** → ${c.right.label}`,
        c.note ?? '',
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'draft_review': {
      const head = [
        c.title ? `**${c.title}**` : '',
        c.recipient ? `To: ${c.recipient}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      const uncertain = c.uncertain_spans?.length
        ? '\n\nUncertain spans:\n' +
          c.uncertain_spans
            .map((span) => `- ${span.text}${span.reason ? ` — ${span.reason}` : ''}`)
            .join('\n')
        : ''
      return [head, c.body].filter(Boolean).join('\n\n') + uncertain
    }
    case 'plan_card':
      return [
        c.goal ? `**Goal:** ${c.goal}` : '',
        c.steps
          .map((step, i) => {
            const detail = step.detail ? ` — ${step.detail}` : ''
            const ask = step.ask ? `\n  Ask: ${step.ask.label}` : ''
            return `${i + 1}. **${step.title}** (${step.state})${detail}${ask}`
          })
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'decision_tree':
      return [
        `**${c.question}**`,
        c.branches
          .map((branch) => {
            const next = branch.next_question ? ` → ${branch.next_question}` : ''
            const conclusion = branch.conclusion ? ` → **${branch.conclusion}**` : ''
            return `- ${branch.choice}${next}${conclusion}`
          })
          .join('\n'),
      ].join('\n\n')
    case 'checkpoint':
      return [
        c.stages
          .map((stage) => `- **${stage.label}:** ${stage.state}`)
          .join('\n'),
        c.current_status ? `Current: ${c.current_status}` : '',
        c.next_unblock ? `Next: ${c.next_unblock}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'schedule_picker':
      return [
        c.question ?? '**Schedule options**',
        c.slots
          .map((slot) => {
            const preferred = slot.preferred ? ' ⭐' : ''
            const note = slot.note ? ` — ${slot.note}` : ''
            const source = slot.source ? ` (${slot.source})` : ''
            return `- **${slot.date_label}, ${slot.time_range}**${preferred}${note}${source}`
          })
          .join('\n'),
        c.allow_other ? '_Other times allowed._' : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'calendar_view':
      return [
        c.title ? `**${c.title}**${c.range_label ? ` — ${c.range_label}` : ''}` : '',
        c.days
          .map((day) => {
            const events = (day.events ?? [])
              .map((event) => {
                const time = event.time ? `${event.time} ` : ''
                const state = event.state ? ` (${event.state})` : ''
                return `${time}${event.label}${state}`
              })
              .join('; ')
            return `- **${day.name} ${day.number}:** ${events || 'No events'}`
          })
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'heatmap': {
      const values = c.values
        .map((entry) => `${entry.date}: ${entry.value}`)
        .join(' · ')
      return [
        c.title ? `**${c.title}**` : '**Heatmap**',
        c.streak_label ?? '',
        values,
      ]
        .filter(Boolean)
        .join('\n\n')
    }
    case 'trigger_proposal': {
      const alternatives = c.alternatives?.length
        ? '\n\nAlternatives:\n' +
          c.alternatives
            .map((alt) => `- ${alt.label}: \`${alt.cron}\``)
            .join('\n')
        : ''
      return [
        '**Proposed scheduled trigger**',
        c.rationale ?? '',
        `Cadence: ${c.cadence_label} (\`${c.cron}\`)`,
        `Action: ${c.action}`,
      ]
        .filter(Boolean)
        .join('\n\n') + alternatives
    }
    case 'annotated_text': {
      const notes = c.annotations?.length
        ? '\n\nAnnotations:\n' +
          c.annotations
            .map((a) => `- **${a.text}:** ${a.note}`)
            .join('\n')
        : ''
      return [c.source_label ? `**${c.source_label}**` : '', c.content]
        .filter(Boolean)
        .join('\n\n') + notes
    }
    case 'diff':
      return [
        `**${c.before_label ?? 'Before'}**\n\n\`\`\`\n${c.before}\n\`\`\``,
        `**${c.after_label ?? 'After'}**\n\n\`\`\`\n${c.after}\n\`\`\``,
      ].join('\n\n')
    case 'transcript':
      return [
        c.source_label ? `**${c.source_label}**` : '',
        c.lines
          .map((line) => {
            const time = line.time ? `[${line.time}] ` : ''
            const speaker = line.speaker ? `${line.speaker}: ` : ''
            const pin = line.pinned ? ' ⭐' : ''
            const note = line.note ? `\n  Note: ${line.note}` : ''
            return `- ${time}${speaker}${line.text}${pin}${note}`
          })
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'annotated_image': {
      const image = c.url ? `![${c.caption ?? 'annotated image'}](${c.url})` : '*[annotated image]*'
      const pins = c.pins
        .map((pin) => `- **${pin.label}** (${pin.x}, ${pin.y})${pin.note ? ` — ${pin.note}` : ''}`)
        .join('\n')
      return [image, c.caption ?? '', pins ? `Pins:\n${pins}` : '']
        .filter(Boolean)
        .join('\n\n')
    }
    case 'session_brief':
      return [
        c.goal ? `**Goal:** ${c.goal}` : '',
        c.facts
          .map((fact) => {
            const confidence = fact.confidence ? ` (${fact.confidence})` : ''
            const seen = fact.last_seen ? ` — ${fact.last_seen}` : ''
            return `- **${fact.key}:** ${fact.value}${confidence}${seen}`
          })
          .join('\n'),
        c.open_threads?.length
          ? 'Open threads:\n' + c.open_threads.map((t) => `- ${t}`).join('\n')
          : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'agent_tasks':
      return c.tasks
        .map((task) => {
          const cadence = task.cadence ? ` — ${task.cadence}` : ''
          const detail = task.detail ? `\n  ${task.detail}` : ''
          return `- **${task.label}:** ${task.state}${cadence}${detail}`
        })
        .join('\n')
    case 'deferred_list':
      return c.items
        .map((item) => `- **${item.text}:** ${item.reason}`)
        .join('\n')
    case 'decision_matrix': {
      const head = '| Criteria | Weight | ' + c.options.join(' | ') + ' |'
      const sep = '| --- | ---: | ' + c.options.map(() => '---:').join(' | ') + ' |'
      const rows = c.criteria.map(
        (criterion) =>
          `| ${criterion.label} | ${criterion.weight} | ` +
          c.options.map((option) => String(criterion.scores[option] ?? '')).join(' | ') +
          ' |',
      )
      const recommendation = c.recommended_option
        ? `\n\n**Recommended:** ${c.recommended_option}`
        : ''
      const rationale = c.rationale ? `\n\n${c.rationale}` : ''
      return [head, sep, ...rows].join('\n') + recommendation + rationale
    }
    case 'pros_cons': {
      const pros = c.pros
        .map((item) => `- ${item.text}${typeof item.weight === 'number' ? ` (${item.weight})` : ''}`)
        .join('\n')
      const cons = c.cons
        .map((item) => `- ${item.text}${typeof item.weight === 'number' ? ` (${item.weight})` : ''}`)
        .join('\n')
      return [
        c.question ? `**${c.question}**` : '',
        pros ? `Pros:\n${pros}` : '',
        cons ? `Cons:\n${cons}` : '',
        c.recommendation ? `Recommendation: ${c.recommendation}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    }
    case 'ranking':
      return [
        c.question ?? '',
        c.items
          .map((item, i) => `${i + 1}. **${item.label}**${item.rationale ? ` — ${item.rationale}` : ''}`)
          .join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'timer':
      return `**Timer:** ${c.label} — ${formatDuration(c.elapsed_seconds ?? 0)} elapsed of ${formatDuration(c.duration_seconds)}${c.mode ? ` (${c.mode})` : ''}`
    case 'counter':
      return `**Counter:** ${c.label} — ${c.value}${c.target ? ` / ${c.target}` : ''}${c.unit ? ` ${c.unit}` : ''}`
    case 'scratchpad':
      return [
        `**${c.title ?? 'Scratchpad'}**${c.shared_with_agent ? ' _(shared with agent)_' : ''}`,
        c.content,
        c.privacy_note ? `_${c.privacy_note}_` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'network':
      return [
        'Nodes: ' + c.nodes.map((node) => node.label).join(', '),
        'Edges:\n' +
          c.edges
            .map((edge) => `- ${edge.from} → ${edge.to}${edge.label ? ` — ${edge.label}` : ''}`)
            .join('\n'),
      ].join('\n\n')
    case 'tree':
      return [
        c.root_label ? `**${c.root_label}**` : '',
        renderTreeRows(c.nodes),
      ]
        .filter(Boolean)
        .join('\n\n')
    case 'sankey':
      return c.flows
        .map((flow) => {
          const from = c.nodes.find((node) => node.id === flow.from)?.label ?? flow.from
          const to = c.nodes.find((node) => node.id === flow.to)?.label ?? flow.to
          return `- ${from} → ${to}: **${flow.value}**${flow.label ? ` ${flow.label}` : ''}`
        })
        .join('\n')
    default:
      return ''
  }
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

function renderTreeRows(nodes: Extract<ArtifactComponent, { type: 'tree' }>['nodes']): string {
  const byParent = new Map<string | undefined, typeof nodes>()
  for (const node of nodes) {
    const list = byParent.get(node.parent_id) ?? []
    list.push(node)
    byParent.set(node.parent_id, list)
  }
  const lines: string[] = []
  const visit = (parentId: string | undefined, depth: number): void => {
    for (const node of byParent.get(parentId) ?? []) {
      const indent = '  '.repeat(depth)
      const value = node.value ? ` — ${node.value}` : ''
      lines.push(`${indent}- ${node.label}${value}`)
      visit(node.id, depth + 1)
    }
  }
  visit(undefined, 0)
  return lines.join('\n')
}
