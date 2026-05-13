// =====================================================================
// Artifact Renderer — switches on `component.type` and renders.
//
// Every renderer mirrors the schema in shared/artifact.ts. To extend:
//   1. Add the type interface in shared/artifact.ts.
//   2. Add the renderer here.
//   3. Add the dispatch case below.
//   4. Add the corresponding `.c-…` CSS in styles/components.css.
//   5. Document it in src/agent-prompt.ts.
// =====================================================================

import { useMemo, useState, type JSX } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'

import type {
  AlertComponent,
  Artifact,
  ArtifactComponent,
  BarChartComponent,
  ChecklistComponent,
  ComparisonComponent,
  DataRowComponent,
  HeadingComponent,
  HtmlEmbedComponent,
  ImageComponent,
  KeyValueListComponent,
  LineChartComponent,
  LinkPreviewComponent,
  MapComponent,
  MarkdownComponent,
  ParagraphComponent,
  ProgressComponent,
  QuestionSetComponent,
  QuoteComponent,
  ReflexProposalComponent,
  SourcesComponent,
  SparklineComponent,
  StatusListComponent,
  TableComponent,
  ThemeColor,
  TimelineComponent,
} from '@shared/index'
import { describeCondition } from '@shared/index'
import type { ArtifactInteractionHandler } from '../../lib/artifactInteractions'
import { Icon } from '../icons/Icon'
import {
  CAgentTasks,
  CAnnotatedImage,
  CAnnotatedText,
  CAssumptionList,
  CCalculation,
  CCalendarView,
  CCheckpoint,
  CConfidenceBand,
  CCounter,
  CCounterProposal,
  CDecisionMatrix,
  CDecisionTree,
  CDeferredList,
  CDiff,
  CDraftReview,
  CHeatmap,
  CNetwork,
  CPlanCard,
  CProsCons,
  CRanking,
  CSankey,
  CSchedulePicker,
  CScratchpad,
  CSessionBrief,
  CTimer,
  CTradeoffSlider,
  CTranscript,
  CTree,
  CTriggerProposal,
  CWhatIf,
} from './vocabulary'

const colorToVar = (c?: ThemeColor): string => {
  switch (c) {
    case 'signal':
      return 'var(--signal)'
    case 'cool':
      return 'var(--cool)'
    case 'green':
      return 'var(--green)'
    case 'amber':
      return 'var(--amber)'
    case 'red':
      return 'var(--red)'
    case 'muted':
      return 'var(--text-3)'
    default:
      return 'var(--cool)'
  }
}

// ─── 1. data_row ─────────────────────────────────────────────────────
function CDataRow({ cells }: DataRowComponent): JSX.Element {
  return (
    <div className="c-data-row">
      {cells.map((c, i) => (
        <div className="cell" key={i}>
          <span className={'v ' + (c.color ?? '')}>
            {c.value}
            {c.trend && <span className={'trend ' + c.trend}>{trendGlyph(c.trend)}</span>}
          </span>
          <span className="l">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

const trendGlyph = (t: string): string => {
  switch (t) {
    case 'up':
      return '↑'
    case 'down':
      return '↓'
    case 'flat':
      return '→'
    case 'warn':
      return '⚠'
    default:
      return ''
  }
}

// ─── 2. paragraph ────────────────────────────────────────────────────
function CParagraph({ text, emphasis }: ParagraphComponent): JSX.Element {
  return <p className={'c-paragraph' + (emphasis ? ' emph' : '')}>{text}</p>
}

// ─── 3. heading ──────────────────────────────────────────────────────
function CHeading({ text, level = 2 }: HeadingComponent): JSX.Element {
  return level === 3 ? (
    <h3 className="c-heading-3">{text}</h3>
  ) : (
    <h2 className="c-heading-2">{text}</h2>
  )
}

// ─── 4. sparkline ────────────────────────────────────────────────────
function CSparkline({
  values,
  labels,
  thresholds = [],
  base_color = 'cool',
}: SparklineComponent): JSX.Element {
  const max = Math.max(1, ...values)
  const sortedThresholds = [...thresholds].sort((a, b) => b.above - a.above)
  const colorFor = (v: number): string => {
    for (const t of sortedThresholds) if (v > t.above) return t.color
    return base_color
  }
  return (
    <div className="c-sparkline">
      <div className="bars">
        {values.map((v, i) => (
          <div
            key={i}
            className={'bar ' + colorFor(v)}
            style={{
              height: `${(v / max) * 100}%`,
              opacity: 0.5 + (v / max) * 0.5,
            }}
          />
        ))}
      </div>
      {labels && (
        <div className="labels">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 5. line_chart ───────────────────────────────────────────────────
function CLineChart({ series, x_labels }: LineChartComponent): JSX.Element {
  const W = 320
  const H = 140
  const pad = { l: 24, r: 8, t: 8, b: 24 }
  const allValues = series.flatMap((s) => s.values)
  const maxY = Math.max(...allValues) * 1.1 || 1
  const minY = Math.min(...allValues) * 0.9
  const xStep = (W - pad.l - pad.r) / Math.max(1, x_labels.length - 1)

  const buildPath = (values: number[]): string =>
    values
      .map((v, i) => {
        const x = pad.l + i * xStep
        const y = pad.t + (1 - (v - minY) / (maxY - minY)) * (H - pad.t - pad.b)
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')

  return (
    <div className="c-line-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line
            key={i}
            x1={pad.l}
            x2={W - pad.r}
            y1={pad.t + p * (H - pad.t - pad.b)}
            y2={pad.t + p * (H - pad.t - pad.b)}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />
        ))}
        {x_labels.map((l, i) => (
          <text
            key={i}
            x={pad.l + i * xStep}
            y={H - 6}
            fill="var(--text-3)"
            fontSize={9}
            fontFamily="var(--mono)"
            textAnchor="middle"
            letterSpacing="0.05em"
          >
            {l}
          </text>
        ))}
        {series.map((s, idx) => {
          const color = colorToVar(s.color)
          return (
            <g key={idx}>
              <path
                d={buildPath(s.values)}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.values.map((v, i) => {
                const x = pad.l + i * xStep
                const y = pad.t + (1 - (v - minY) / (maxY - minY)) * (H - pad.t - pad.b)
                return <circle key={i} cx={x} cy={y} r={2} fill={color} />
              })}
            </g>
          )
        })}
      </svg>
      <div className="legend">
        {series.map((s, i) => (
          <div className="legend-item" key={i}>
            <span className="swatch" style={{ background: colorToVar(s.color) }} />
            {s.name}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 6. bar_chart ────────────────────────────────────────────────────
function CBarChart({ groups }: BarChartComponent): JSX.Element {
  const allValues = groups.flatMap((g) => g.values.map((v) => v.value))
  const max = Math.max(1, ...allValues)
  return (
    <div className="c-bar-chart">
      {groups.map((g, gi) => (
        <div className="group" key={gi}>
          <div className="group-label">{g.label}</div>
          <div className="bars">
            {g.values.map((v, i) => (
              <div
                key={i}
                className="bar"
                style={{
                  width: `${(v.value / max) * 100}%`,
                  background: colorToVar(v.color),
                }}
              >
                {v.name}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 7. table ────────────────────────────────────────────────────────
function CTable({ headers, rows }: TableComponent): JSX.Element {
  return (
    <table className="c-table">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>
            {r.cells.map((c, ci) => {
              const tone = r.colors?.[ci]
              return (
                <td key={ci} className={tone ?? ''}>
                  {c}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── 8. quote ────────────────────────────────────────────────────────
function CQuote({ text, attribution, color = 'signal' }: QuoteComponent): JSX.Element {
  return (
    <blockquote className={'c-quote ' + color}>
      “{text}”
      {attribution && <span className="attr">— {attribution}</span>}
    </blockquote>
  )
}

// ─── 9. alert ────────────────────────────────────────────────────────
function CAlert({ severity = 'info', title, text }: AlertComponent): JSX.Element {
  const glyph = severity === 'critical' ? '!' : severity === 'warning' ? '!' : 'i'
  return (
    <div className={'c-alert ' + severity}>
      <div className="icon">{glyph}</div>
      <div className="body">
        {title && <div className="title">{title}</div>}
        <div className="text">{text}</div>
      </div>
    </div>
  )
}

// ─── 10. timeline ────────────────────────────────────────────────────
function CTimeline({ segments }: TimelineComponent): JSX.Element {
  return (
    <div className="c-timeline">
      <div className="track">
        {segments.map((s, i) => (
          <div
            key={i}
            className={'seg ' + (s.status ?? '')}
            style={{ flex: s.duration }}
          />
        ))}
      </div>
      <div className="labels">
        {segments.map((s, i) => (
          <span key={i} style={{ flex: s.duration }}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── 11. progress ────────────────────────────────────────────────────
function CProgress({ items, display = 'bar' }: ProgressComponent): JSX.Element {
  if (display === 'ring') {
    return (
      <div className="c-progress ring">
        {items.map((it, i) => {
          const pct = it.value / it.max
          const color = colorToVar(it.color)
          const c = 22 * 2 * Math.PI
          return (
            <div className="item" key={i}>
              <svg viewBox="0 0 60 60">
                <circle cx="30" cy="30" r="22" stroke="var(--surface-2)" strokeWidth={3} fill="none" />
                <circle
                  cx="30"
                  cy="30"
                  r="22"
                  stroke={color}
                  strokeWidth={3}
                  fill="none"
                  strokeDasharray={c}
                  strokeDashoffset={c * (1 - pct)}
                  strokeLinecap="round"
                  transform="rotate(-90 30 30)"
                />
                <text
                  x="30"
                  y="34"
                  textAnchor="middle"
                  fill="var(--text)"
                  fontSize={12}
                  fontFamily="var(--mono)"
                  fontWeight={500}
                >
                  {Math.round(pct * 100)}%
                </text>
              </svg>
              <span className="label">{it.label}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <div className="c-progress bar">
      {items.map((it, i) => (
        <div className="item" key={i}>
          <div className="item-head">
            <span>{it.label}</span>
            <span className="v">
              {it.value}
              {it.max === 100 ? '%' : ` / ${it.max}`}
            </span>
          </div>
          <div className="track">
            <div
              className={'fill ' + (it.color ?? '')}
              style={{ width: `${(it.value / it.max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 12. sources ─────────────────────────────────────────────────────
function CSources({ items }: SourcesComponent): JSX.Element {
  return (
    <div className="c-sources">
      <span className="src-icon">
        <Icon name="link" size={11} />
      </span>
      {items.map((s, i) => (
        <span className="src" key={i}>
          {s}
        </span>
      ))}
    </div>
  )
}

// ─── 13. status_list ─────────────────────────────────────────────────
function CStatusList({ items }: StatusListComponent): JSX.Element {
  return (
    <div className="c-status-list">
      {items.map((it, i) => (
        <div className="row" key={i}>
          <div className="left">
            {it.icon && <div className="ico">{it.icon}</div>}
            <span className="label">{it.label}</span>
          </div>
          <span className={'val ' + (it.color ?? '')}>{it.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── 14. image ───────────────────────────────────────────────────────
function CImage({ caption, aspect, url }: ImageComponent): JSX.Element {
  const aspectClass =
    aspect === '1:1' ? ' aspect-1' : aspect === '4:3' ? ' aspect-43' : ''
  return (
    <div className={'c-image' + aspectClass}>
      {url ? (
        <img src={url} alt={caption ?? ''} style={{ width: '100%', display: 'block' }} />
      ) : (
        <div className="placeholder">image placeholder</div>
      )}
      {caption && <div className="caption">{caption}</div>}
    </div>
  )
}

// ─── 15. html_embed ──────────────────────────────────────────────────
function CHtmlEmbed({ content, height }: HtmlEmbedComponent): JSX.Element {
  // Sandboxed iframe — same-origin scripts off, no top-level navigation,
  // no plugins, no popups. The agent's HTML can run inert, no ambient
  // access to anything outside.
  return (
    <iframe
      className="c-html-embed"
      srcDoc={content}
      sandbox=""
      style={{
        width: '100%',
        height: height ?? 280,
        border: '1px solid var(--hairline)',
        borderRadius: 10,
        background: 'var(--bg-deep)',
      }}
    />
  )
}

// ─── 16. checklist ───────────────────────────────────────────────────
function CChecklist({
  items,
  onToggle,
}: ChecklistComponent & { onToggle?: (id: string) => void }): JSX.Element {
  return (
    <div className="c-checklist">
      {items.map((it) => (
        <div
          key={it.id}
          className={'item' + (it.checked ? ' checked' : '')}
          onClick={() => onToggle?.(it.id)}
        >
          <div className="check">
            <Icon name="check" />
          </div>
          <div className="text">{it.text}</div>
        </div>
      ))}
    </div>
  )
}

// ─── 17. comparison ──────────────────────────────────────────────────
function CComparison({ items }: ComparisonComponent): JSX.Element {
  const cls = items.length === 3 ? ' three' : ''
  return (
    <div className={'c-comparison' + cls}>
      {items.map((it, i) => (
        <div key={i} className={'col' + (it.highlight ? ' highlight' : '')}>
          <h4>{it.name}</h4>
          {Object.entries(it.metrics).map(([k, v]) => (
            <div className="metric" key={k}>
              <span className="k">{k}</span>
              <span className="v">{String(v)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── 18. divider ─────────────────────────────────────────────────────
function CDivider(): JSX.Element {
  return <div className="c-divider" />
}

// ─── 19. map ─────────────────────────────────────────────────────────
function CMap({ markers = [] }: MapComponent): JSX.Element {
  return (
    <div className="c-map">
      <div className="grid" />
      <div className="roads">
        <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
          <path
            d="M-10 70 L100 80 L160 60 L240 90 L340 80"
            stroke="rgba(139,164,196,0.3)"
            strokeWidth={1.5}
            fill="none"
          />
          <path
            d="M-10 130 L80 140 L180 110 L340 140"
            stroke="rgba(139,164,196,0.2)"
            strokeWidth={1}
            fill="none"
          />
          <path
            d="M120 -10 L130 80 L160 180"
            stroke="rgba(139,164,196,0.25)"
            strokeWidth={1}
            fill="none"
          />
          <path
            d="M220 -10 L210 90 L240 180"
            stroke="rgba(139,164,196,0.18)"
            strokeWidth={1}
            fill="none"
          />
        </svg>
      </div>
      {markers.map((m, i) => (
        <div
          key={i}
          className={'marker ' + (m.color ?? '')}
          style={{
            // Until we wire a real map projection, distribute markers visually.
            left: `${30 + (i * 19) % 70}%`,
            top: `${35 + (i * 23) % 50}%`,
          }}
        >
          <span className="pin" />
          {m.label && <span className="lbl">{m.label}</span>}
        </div>
      ))}
    </div>
  )
}

// ─── 20. question_set ───────────────────────────────────────────────
function CQuestionSet({
  questions,
  submit_label,
  onSubmit,
}: QuestionSetComponent & {
  onSubmit?: (answers: Array<{ id: string; label: string; value: string }>) => void
}): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState(false)
  const filledCount = questions.filter((q) =>
    (values[q.id] ?? '').trim().length > 0,
  ).length
  const allFilled = filledCount === questions.length

  const submit = (): void => {
    if (submitted) return
    setSubmitted(true)
    const answers = questions.map((q) => ({
      id: q.id,
      label: q.label,
      value: (values[q.id] ?? '').trim(),
    }))
    onSubmit?.(answers)
  }

  return (
    <div className="c-question-set">
      {questions.map((q) => (
        <div className="question" key={q.id}>
          <label className="q-label" htmlFor={`qs-${q.id}`}>
            {q.label}
          </label>
          {q.multiline ? (
            <textarea
              id={`qs-${q.id}`}
              rows={3}
              placeholder={q.placeholder}
              value={values[q.id] ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, [q.id]: e.target.value }))
              }
              disabled={submitted}
            />
          ) : (
            <input
              id={`qs-${q.id}`}
              type="text"
              placeholder={q.placeholder}
              value={values[q.id] ?? ''}
              onChange={(e) =>
                setValues((v) => ({ ...v, [q.id]: e.target.value }))
              }
              disabled={submitted}
            />
          )}
          {q.hint && <div className="q-hint">{q.hint}</div>}
        </div>
      ))}
      <div className="submit-row">
        <button
          type="button"
          className="btn primary"
          onClick={submit}
          disabled={submitted || filledCount === 0}
        >
          {submitted
            ? 'Sent'
            : (submit_label ?? `Submit ${allFilled ? 'answers' : `${filledCount} of ${questions.length}`}`)}
        </button>
        {!submitted && !allFilled && filledCount > 0 && (
          <span className="progress-text">
            {questions.length - filledCount} unanswered
          </span>
        )}
      </div>
    </div>
  )
}

// ─── 21. markdown ───────────────────────────────────────────────────
function CMarkdown({ content }: MarkdownComponent): JSX.Element {
  // marked + DOMPurify: parse markdown → sanitize HTML → inject. Both
  // already in deps. We use sync mode and a permissive sanitizer that
  // still strips scripts and event handlers.
  const html = useMemo(() => {
    const raw = marked.parse(content ?? '', { async: false }) as string
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'blockquote', 'hr', 'br', 'span',
      ],
      ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    })
  }, [content])
  return <div className="c-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

// ─── 22. key_value_list ─────────────────────────────────────────────
function CKeyValueList({ items }: KeyValueListComponent): JSX.Element {
  return (
    <div className="c-kv-list">
      {items.map((it, i) => (
        <div className="row" key={i}>
          <span className="k">{it.key}</span>
          <span className={'v ' + (it.color ?? '')}>{it.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── 24. reflex_proposal ────────────────────────────────────────────
function CReflexProposal({
  proposal,
  onApprove,
  onDismiss,
}: {
  proposal: ReflexProposalComponent
  onApprove?: (proposal: ReflexProposalComponent) => void
  onDismiss?: () => void
}): JSX.Element {
  const [state, setState] = useState<'pending' | 'approving' | 'approved' | 'dismissed'>(
    'pending',
  )
  const debounceMin = Math.round((proposal.debounce_seconds ?? 300) / 60)
  const cadenceText = debounceMin >= 1 ? `at most once every ${debounceMin} min` : 'no debounce'

  const approve = async (): Promise<void> => {
    if (state !== 'pending' || !onApprove) return
    setState('approving')
    try {
      await onApprove(proposal)
      setState('approved')
    } catch {
      setState('pending')
    }
  }
  const dismiss = (): void => {
    if (state !== 'pending') return
    setState('dismissed')
    onDismiss?.()
  }

  return (
    <div className={'c-reflex-proposal state-' + state}>
      <div className="head">
        <span className="tag">PROPOSED REFLEX</span>
        <span className="cadence">{cadenceText}</span>
      </div>
      <div className="desc">{proposal.description}</div>
      <div className="match">
        <span className="src">{proposal.source_name}</span>
        {proposal.conditions.length > 0 && (
          <ul>
            {proposal.conditions.map((c, i) => (
              <li key={i}>{describeCondition(c)}</li>
            ))}
          </ul>
        )}
        {proposal.conditions.length === 0 && (
          <span className="any">on every observation</span>
        )}
      </div>
      <div className="kickoff">
        <span className="k-label">Then run with</span>
        <div className="k-prompt">"{proposal.kickoff_prompt}"</div>
        {proposal.artifact_hint && (
          <span className="hint">Suggested artifact: {proposal.artifact_hint}</span>
        )}
      </div>
      <div className="proposal-actions">
        {state === 'pending' && (
          <>
            <button
              type="button"
              className="btn primary"
              onClick={approve}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={dismiss}
            >
              Dismiss
            </button>
          </>
        )}
        {state === 'approving' && (
          <span className="status">Wiring up…</span>
        )}
        {state === 'approved' && (
          <span className="status approved">
            <Icon name="check" /> Active — will fire when matched
          </span>
        )}
        {state === 'dismissed' && (
          <span className="status">Dismissed</span>
        )}
      </div>
    </div>
  )
}

// ─── 23. link_preview ───────────────────────────────────────────────
function CLinkPreview({
  url,
  title,
  description,
  domain,
}: LinkPreviewComponent): JSX.Element {
  const host = domain ?? safeHost(url)
  return (
    <a
      className="c-link-preview"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {host && <span className="domain">{host}</span>}
      {title && <span className="title">{title}</span>}
      {description && <span className="desc">{description}</span>}
      <span className="url">{url}</span>
    </a>
  )
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

// ─── Dispatcher ──────────────────────────────────────────────────────
export function ArtifactComponentView({
  component,
  onChecklistToggle,
  onQuestionSetSubmit,
  onInteraction,
  onReflexApprove,
  onReflexDismiss,
}: {
  component: ArtifactComponent
  onChecklistToggle?: (id: string) => void
  onQuestionSetSubmit?: (
    answers: Array<{ id: string; label: string; value: string }>,
  ) => void
  onInteraction?: ArtifactInteractionHandler
  onReflexApprove?: (proposal: ReflexProposalComponent) => void | Promise<void>
  onReflexDismiss?: () => void
}): JSX.Element | null {
  switch (component.type) {
    case 'data_row':
      return <CDataRow {...component} />
    case 'paragraph':
      return <CParagraph {...component} />
    case 'heading':
      return <CHeading {...component} />
    case 'sparkline':
      return <CSparkline {...component} />
    case 'line_chart':
      return <CLineChart {...component} />
    case 'bar_chart':
      return <CBarChart {...component} />
    case 'table':
      return <CTable {...component} />
    case 'quote':
      return <CQuote {...component} />
    case 'alert':
      return <CAlert {...component} />
    case 'timeline':
      return <CTimeline {...component} />
    case 'progress':
      return <CProgress {...component} />
    case 'sources':
      return <CSources {...component} />
    case 'status_list':
      return <CStatusList {...component} />
    case 'image':
      return <CImage {...component} />
    case 'html_embed':
      return <CHtmlEmbed {...component} />
    case 'checklist':
      return <CChecklist {...component} onToggle={onChecklistToggle} />
    case 'comparison':
      return <CComparison {...component} />
    case 'divider':
      return <CDivider />
    case 'map':
      return <CMap {...component} />
    case 'question_set':
      return <CQuestionSet {...component} onSubmit={onQuestionSetSubmit} />
    case 'markdown':
      return <CMarkdown {...component} />
    case 'key_value_list':
      return <CKeyValueList {...component} />
    case 'link_preview':
      return <CLinkPreview {...component} />
    case 'calculation':
      return <CCalculation {...component} />
    case 'what_if':
      return <CWhatIf {...component} onInteraction={onInteraction} />
    case 'assumption_list':
      return <CAssumptionList {...component} onInteraction={onInteraction} />
    case 'confidence_band':
      return <CConfidenceBand {...component} />
    case 'counter_proposal':
      return <CCounterProposal {...component} onInteraction={onInteraction} />
    case 'tradeoff_slider':
      return <CTradeoffSlider {...component} onInteraction={onInteraction} />
    case 'draft_review':
      return <CDraftReview {...component} onInteraction={onInteraction} />
    case 'plan_card':
      return <CPlanCard {...component} />
    case 'decision_tree':
      return <CDecisionTree {...component} onInteraction={onInteraction} />
    case 'checkpoint':
      return <CCheckpoint {...component} />
    case 'schedule_picker':
      return <CSchedulePicker {...component} onInteraction={onInteraction} />
    case 'calendar_view':
      return <CCalendarView {...component} />
    case 'heatmap':
      return <CHeatmap {...component} />
    case 'trigger_proposal':
      return <CTriggerProposal {...component} onInteraction={onInteraction} />
    case 'annotated_text':
      return <CAnnotatedText {...component} />
    case 'diff':
      return <CDiff {...component} />
    case 'transcript':
      return <CTranscript {...component} />
    case 'annotated_image':
      return <CAnnotatedImage {...component} />
    case 'session_brief':
      return <CSessionBrief {...component} />
    case 'agent_tasks':
      return <CAgentTasks {...component} />
    case 'deferred_list':
      return <CDeferredList {...component} />
    case 'decision_matrix':
      return <CDecisionMatrix {...component} />
    case 'pros_cons':
      return <CProsCons {...component} />
    case 'ranking':
      return <CRanking {...component} onInteraction={onInteraction} />
    case 'timer':
      return <CTimer {...component} onInteraction={onInteraction} />
    case 'counter':
      return <CCounter {...component} onInteraction={onInteraction} />
    case 'scratchpad':
      return <CScratchpad {...component} onInteraction={onInteraction} />
    case 'network':
      return <CNetwork {...component} />
    case 'tree':
      return <CTree {...component} />
    case 'sankey':
      return <CSankey {...component} />
    case 'reflex_proposal':
      return (
        <CReflexProposal
          proposal={component}
          onApprove={onReflexApprove}
          onDismiss={onReflexDismiss}
        />
      )
    default:
      return null
  }
}

// ─── Card wrapper ────────────────────────────────────────────────────
export function ArtifactCard({
  artifact,
  dense = false,
  onTap,
}: {
  artifact: Artifact
  dense?: boolean
  onTap?: () => void
}): JSX.Element {
  const accent = artifact.header.label_color
  const accentClass = accent && accent !== 'signal' && accent !== 'muted' ? ' ' + accent : ''
  const isLive = !!(artifact.subscribes_to && artifact.subscribes_to.length > 0)
  const versionCount = artifact.version ?? 0
  return (
    <div
      className={
        'artifact' +
        (accent ? ' has-accent' + accentClass : '') +
        (onTap ? ' tap' : '') +
        (isLive ? ' is-live' : '')
      }
      onClick={onTap}
    >
      <div className="artifact-header">
        <div className="topline">
          <span className={'label ' + (accent ?? '')}>{artifact.header.label}</span>
          {isLive && (
            <span className="live-badge" title="Subscribes to a source — updates in place">
              <span className="dot" />
              <span className="label">LIVE</span>
            </span>
          )}
          <span className="when">{artifact.header.timestamp_display}</span>
        </div>
        <h3>{artifact.header.title}</h3>
        {artifact.header.summary && (
          <p className="summary">{artifact.header.summary}</p>
        )}
      </div>
      {!dense &&
        artifact.components.map((c, i) => (
          <ArtifactComponentView key={i} component={c} />
        ))}
      {versionCount > 0 && (
        <div className="artifact-foot">
          <span className="versions">
            Updated {versionCount}× since posting
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Detail view (header + components + actions) ─────────────────────
export function ArtifactDetail({
  artifact,
  onAction,
  onQuestionSetSubmit,
  onInteraction,
  onReflexApprove,
  onShowHistory,
}: {
  artifact: Artifact
  onAction?: (action: NonNullable<Artifact['actions']>[number]) => void
  onQuestionSetSubmit?: (
    answers: Array<{ id: string; label: string; value: string }>,
  ) => void
  onInteraction?: ArtifactInteractionHandler
  onReflexApprove?: (
    proposal: ReflexProposalComponent,
  ) => void | Promise<void>
  onShowHistory?: () => void
}): JSX.Element {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const toggle = (id: string): void =>
    setChecked((s) => ({ ...s, [id]: !s[id] }))

  const accent = artifact.header.label_color
  const isLive = !!(artifact.subscribes_to && artifact.subscribes_to.length > 0)
  const versionCount = artifact.version ?? 0
  return (
    <div style={{ padding: '0 var(--screen-pad)' }} className="rise">
      <div style={{ marginBottom: 18 }}>
        <div
          className="t-tag"
          style={{
            marginBottom: 10,
            color: colorToVar(accent ?? 'signal'),
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>
            {artifact.header.label} · {artifact.header.timestamp_display}
          </span>
          {isLive && (
            <span className="live-badge">
              <span className="dot" />
              <span className="label">LIVE</span>
            </span>
          )}
          {versionCount > 0 && (
            <button
              type="button"
              className="versions-link"
              onClick={onShowHistory}
              disabled={!onShowHistory}
            >
              Updated {versionCount}×
            </button>
          )}
        </div>
        <h1
          className="t-headline"
          style={{ marginBottom: 10, textWrap: 'pretty' }}
        >
          {artifact.header.title}
        </h1>
        {artifact.header.summary && (
          <p className="t-body">{artifact.header.summary}</p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {artifact.components.map((c, i) => (
          <ArtifactComponentView
            key={i}
            onReflexApprove={onReflexApprove}
            component={
              c.type === 'checklist'
                ? {
                    ...c,
                    items: c.items.map((it) => ({
                      ...it,
                      checked: checked[it.id] ?? it.checked,
                    })),
                  }
                : c
            }
            onChecklistToggle={toggle}
            onQuestionSetSubmit={onQuestionSetSubmit}
            onInteraction={onInteraction}
          />
        ))}
      </div>

      {artifact.actions && artifact.actions.length > 0 && (
        <div className="action-row" style={{ marginTop: 22 }}>
          {artifact.actions.map((act, i) => (
            <button
              key={i}
              className={'btn ' + (act.primary ? 'primary' : 'ghost')}
              type="button"
              onClick={() => onAction?.(act)}
            >
              {act.action === 'export' && <Icon name="export" />}
              {act.action === 'share' && <Icon name="share" />}
              {act.action === 'confirm' && <Icon name="check" />}
              {act.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
