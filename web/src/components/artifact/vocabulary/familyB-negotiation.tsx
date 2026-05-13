import { useMemo, useState, type JSX } from 'react'

import type {
  CounterProposalComponent,
  DraftReviewComponent,
  TradeoffSliderComponent,
} from '@shared/index'
import type { VocabularyRendererProps } from './types'

type SegmentChoice = 'pending' | 'accepted' | 'modified' | 'rejected'

export function CCounterProposal({
  intro,
  segments,
  submit_label,
  onInteraction,
}: CounterProposalComponent & VocabularyRendererProps): JSX.Element {
  const [choices, setChoices] = useState<Record<string, SegmentChoice>>(() =>
    Object.fromEntries(
      segments.map((segment) => [segment.id, segment.state ?? 'pending']),
    ),
  )
  const [modified, setModified] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      segments.map((segment) => [segment.id, segment.modified_text ?? '']),
    ),
  )
  const [reasons, setReasons] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      segments.map((segment) => [segment.id, segment.reject_reason ?? '']),
    ),
  )
  const [sent, setSent] = useState(false)

  const submit = (): void => {
    const payload = segments.map((segment) => ({
      id: segment.id,
      label: segment.label,
      proposal: segment.proposal,
      state: choices[segment.id] ?? 'pending',
      modified_text: modified[segment.id] ?? '',
      reject_reason: reasons[segment.id] ?? '',
    }))
    setSent(true)
    void onInteraction?.({
      kind: 'counter_proposal.submit',
      component_type: 'counter_proposal',
      payload: { segments: payload },
    })
  }

  return (
    <div className="c-counter-proposal">
      {intro && <p className="intro">{intro}</p>}
      {segments.map((segment) => {
        const choice = choices[segment.id] ?? 'pending'
        return (
          <div className={'proposal-segment ' + choice} key={segment.id}>
            <div className="segment-head">
              <span className="label">{segment.label}</span>
              <span className="state">{choice}</span>
            </div>
            <p>{segment.proposal}</p>
            <div className="segment-actions">
              {(['accepted', 'modified', 'rejected'] as const).map((state) => (
                <button
                  type="button"
                  className={choice === state ? 'mini-btn active' : 'mini-btn'}
                  key={state}
                  onClick={() =>
                    setChoices((s) => ({ ...s, [segment.id]: state }))
                  }
                >
                  {state === 'accepted'
                    ? 'Accept'
                    : state === 'modified'
                      ? 'Modify'
                      : 'Reject'}
                </button>
              ))}
            </div>
            {choice === 'modified' && (
              <textarea
                rows={2}
                placeholder="What should this say instead?"
                value={modified[segment.id] ?? ''}
                onChange={(e) =>
                  setModified((s) => ({
                    ...s,
                    [segment.id]: e.target.value,
                  }))
                }
              />
            )}
            {choice === 'rejected' && (
              <textarea
                rows={2}
                placeholder="Optional reason for rejecting this segment"
                value={reasons[segment.id] ?? ''}
                onChange={(e) =>
                  setReasons((s) => ({
                    ...s,
                    [segment.id]: e.target.value,
                  }))
                }
              />
            )}
          </div>
        )
      })}
      <button type="button" className="btn primary" onClick={submit}>
        {sent ? 'Sent' : (submit_label ?? 'Submit decisions')}
      </button>
    </div>
  )
}

export function CTradeoffSlider({
  question,
  left,
  right,
  value,
  min = 0,
  max = 100,
  note,
  submit_label,
  onInteraction,
}: TradeoffSliderComponent & VocabularyRendererProps): JSX.Element {
  const [current, setCurrent] = useState(value)
  const [sent, setSent] = useState(false)
  const pct = max === min ? 50 : ((current - min) / (max - min)) * 100

  const submit = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'tradeoff_slider.submit',
      component_type: 'tradeoff_slider',
      payload: { question, value: current, min, max, left, right },
    })
  }

  return (
    <div className="c-tradeoff-slider">
      <div className="question">{question}</div>
      <div className="tradeoff-scale">
        <div>
          <strong>{left.label}</strong>
          {left.description && <span>{left.description}</span>}
        </div>
        <div>
          <strong>{right.label}</strong>
          {right.description && <span>{right.description}</span>}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={current}
        onChange={(e) => setCurrent(Number(e.target.value))}
        style={{ backgroundSize: `${pct}% 100%` }}
      />
      <div className="slider-readout">{Math.round(pct)}%</div>
      {note && <p className="note">{note}</p>}
      <button type="button" className="btn primary" onClick={submit}>
        {sent ? 'Sent' : (submit_label ?? 'Apply preference')}
      </button>
    </div>
  )
}

export function CDraftReview({
  title,
  recipient,
  body = '',
  uncertain_spans = [],
  submit_label,
  onInteraction,
}: DraftReviewComponent & VocabularyRendererProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(body)
  const [sent, setSent] = useState(false)
  // Preview must reflect the user's edits, not the original `body`. The
  // payload sends `draft`, so showing highlights against `body` here
  // would let the user approve/send text they never actually saw.
  const marked = useMemo(
    () => markUncertainText(draft, uncertain_spans),
    [draft, uncertain_spans],
  )

  const submit = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'draft_review.submit',
      component_type: 'draft_review',
      payload: { title, recipient, body: draft, uncertain_spans },
    })
  }

  return (
    <div className="c-draft-review">
      {(title || recipient) && (
        <div className="draft-head">
          {title && <strong>{title}</strong>}
          {recipient && <span>{recipient}</span>}
        </div>
      )}
      {editing ? (
        <textarea
          rows={8}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      ) : (
        <div className="draft-body">{marked}</div>
      )}
      {uncertain_spans.length > 0 && (
        <div className="uncertain-list">
          {uncertain_spans.map((span) => (
            <div key={span.id}>
              <strong>{span.text}</strong>
              {span.reason && <span>{span.reason}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="action-row compact">
        <button
          type="button"
          className="btn ghost"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Preview' : 'Mark up'}
        </button>
        <button type="button" className="btn primary" onClick={submit}>
          {sent ? 'Sent' : (submit_label ?? 'Submit draft')}
        </button>
      </div>
    </div>
  )
}

function markUncertainText(
  body: string,
  spans: NonNullable<DraftReviewComponent['uncertain_spans']>,
): JSX.Element[] {
  if (spans.length === 0) return [<p key="body">{body}</p>]
  const parts: JSX.Element[] = []
  let cursor = 0
  let key = 0
  const ordered = spans
    .map((span) => ({ ...span, index: body.indexOf(span.text) }))
    .filter((span) => span.index >= 0)
    .sort((a, b) => a.index - b.index)

  for (const span of ordered) {
    if (span.index < cursor) continue
    if (span.index > cursor) {
      parts.push(<span key={key++}>{body.slice(cursor, span.index)}</span>)
    }
    parts.push(
      <mark key={key++} title={span.reason}>
        {span.text}
      </mark>,
    )
    cursor = span.index + span.text.length
  }
  if (cursor < body.length) parts.push(<span key={key++}>{body.slice(cursor)}</span>)
  return parts
}
