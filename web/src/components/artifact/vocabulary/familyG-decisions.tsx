import { useMemo, useState, type JSX } from 'react'

import type {
  DecisionMatrixComponent,
  ProsConsComponent,
  RankingComponent,
} from '@shared/index'
import type { VocabularyRendererProps } from './types'

export function CDecisionMatrix({
  options,
  criteria,
  recommended_option,
  rationale,
}: DecisionMatrixComponent): JSX.Element {
  const totals = useMemo(() => {
    const next: Record<string, number> = Object.fromEntries(
      options.map((option) => [option, 0]),
    )
    for (const criterion of criteria) {
      for (const option of options) {
        next[option] += (criterion.scores[option] ?? 0) * criterion.weight
      }
    }
    return next
  }, [criteria, options])
  const maxTotal = Math.max(1, ...Object.values(totals))

  return (
    <div className="c-decision-matrix">
      <div className="matrix-scroll">
        <table>
          <thead>
            <tr>
              <th>Criteria</th>
              <th>Weight</th>
              {options.map((option) => (
                <th
                  key={option}
                  className={option === recommended_option ? 'recommended' : ''}
                >
                  {option}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((criterion) => (
              <tr key={criterion.id}>
                <td>{criterion.label}</td>
                <td>{criterion.weight}</td>
                {options.map((option) => (
                  <td key={option}>{criterion.scores[option] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="matrix-totals">
        {options.map((option) => (
          <div
            key={option}
            className={option === recommended_option ? 'total recommended' : 'total'}
          >
            <span>{option}</span>
            <div className="track">
              <span style={{ width: `${(totals[option] / maxTotal) * 100}%` }} />
            </div>
            <strong>{totals[option].toFixed(1)}</strong>
          </div>
        ))}
      </div>
      {rationale && <p className="matrix-rationale">{rationale}</p>}
    </div>
  )
}

export function CProsCons({
  question,
  pros,
  cons,
  recommendation,
}: ProsConsComponent): JSX.Element {
  return (
    <div className="c-pros-cons">
      {question && <div className="question">{question}</div>}
      <div className="ledger">
        <div>
          <span className="vocab-label">Pros</span>
          {pros.map((item, index) => (
            <div className="ledger-item pro" key={index}>
              <span>+</span>
              <p>{item.text}</p>
              {typeof item.weight === 'number' && <strong>{item.weight}</strong>}
            </div>
          ))}
        </div>
        <div>
          <span className="vocab-label">Cons</span>
          {cons.map((item, index) => (
            <div className="ledger-item con" key={index}>
              <span>-</span>
              <p>{item.text}</p>
              {typeof item.weight === 'number' && <strong>{item.weight}</strong>}
            </div>
          ))}
        </div>
      </div>
      {recommendation && <p className="recommendation">{recommendation}</p>}
    </div>
  )
}

export function CRanking({
  question,
  items,
  submit_label,
  onInteraction,
}: RankingComponent & VocabularyRendererProps): JSX.Element {
  const [ordered, setOrdered] = useState(items)
  const [sent, setSent] = useState(false)

  const move = (index: number, delta: number): void => {
    const target = index + delta
    if (target < 0 || target >= ordered.length) return
    setOrdered((current) => {
      const next = current.slice()
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const submit = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'ranking.submit',
      component_type: 'ranking',
      payload: { items: ordered.map((item) => item.id), labels: ordered },
    })
  }

  return (
    <div className="c-ranking">
      {question && <div className="question">{question}</div>}
      {ordered.map((item, index) => (
        <div className="rank-item" key={item.id}>
          <span className="rank">{index + 1}</span>
          <div>
            <strong>{item.label}</strong>
            {item.rationale && <p>{item.rationale}</p>}
          </div>
          <div className="rank-actions">
            <button
              type="button"
              className="mini-btn"
              onClick={() => move(index, -1)}
              disabled={index === 0}
            >
              Up
            </button>
            <button
              type="button"
              className="mini-btn"
              onClick={() => move(index, 1)}
              disabled={index === ordered.length - 1}
            >
              Down
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn primary" onClick={submit}>
        {sent ? 'Sent' : (submit_label ?? 'Submit ranking')}
      </button>
    </div>
  )
}
