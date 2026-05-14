import { useMemo, useState, type JSX } from 'react'

import type {
  AssumptionListComponent,
  CalculationComponent,
  ConfidenceBandComponent,
  WhatIfComponent,
} from '@shared/index'
import { ConfidencePip, EmptyState, clampPct, toneClass } from './utils'
import type { VocabularyRendererProps } from './types'

export function CCalculation({
  label,
  steps,
  result,
}: CalculationComponent): JSX.Element {
  return (
    <div className="c-calculation">
      {label && <div className="vocab-label">{label}</div>}
      {steps.length === 0 ? (
        <EmptyState label="No calculation steps supplied." />
      ) : (
        <div className="calc-steps">
          {steps.map((step, index) => (
            <div
              key={step.id ?? index}
              className={'calc-step' + (step.emphasis ? ' emphasis' : '')}
            >
              <span className="idx">{index + 1}</span>
              <div className="body">
                <span className="label">{step.label}</span>
                {step.expression && (
                  <span className="expr">{step.expression}</span>
                )}
              </div>
              <span className="value">
                {step.value}
                {step.unit ? ` ${step.unit}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {result && (
        <div className={'calc-result' + toneClass(result.color)}>
          <span>{result.label}</span>
          <strong>
            {result.value}
            {result.unit ? ` ${result.unit}` : ''}
          </strong>
        </div>
      )}
    </div>
  )
}

export function CWhatIf({
  label,
  inputs,
  outputs,
  scenarios = [],
  submit_label,
  onInteraction,
}: WhatIfComponent & VocabularyRendererProps): JSX.Element {
  const [values, setValues] = useState<Record<string, string | number>>(() =>
    Object.fromEntries(inputs.map((input) => [input.id, input.value])),
  )
  const [sent, setSent] = useState(false)
  const displayedOutputs = useMemo(
    () => resolveScenarioOutputs({ inputs, values, fallback: outputs, scenarios }),
    [inputs, outputs, scenarios, values],
  )
  const scenarioMatched = displayedOutputs !== outputs

  const submit = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'what_if.submit',
      component_type: 'what_if',
      payload: { inputs: values, outputs: displayedOutputs },
    })
  }

  return (
    <div className="c-what-if">
      {label && <div className="vocab-label">{label}</div>}
      <div className="what-if-inputs">
        {inputs.map((input) => {
          const value = values[input.id] ?? input.value
          return (
            <label className="what-if-input" key={input.id}>
              <span className="input-head">
                <span>{input.label}</span>
                {input.unit && <span className="unit">{input.unit}</span>}
              </span>
              {input.kind === 'choice' ? (
                <select
                  value={String(value)}
                  onChange={(e) =>
                    setValues((s) => ({ ...s, [input.id]: e.target.value }))
                  }
                >
                  {(input.choices ?? []).map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              ) : input.kind === 'slider' ? (
                <>
                  <input
                    type="range"
                    min={input.min ?? 0}
                    max={input.max ?? 100}
                    step={input.step ?? 1}
                    value={Number(value)}
                    onChange={(e) =>
                      setValues((s) => ({
                        ...s,
                        [input.id]: Number(e.target.value),
                      }))
                    }
                  />
                  <span className="current">{String(value)}</span>
                </>
              ) : (
                <input
                  type="number"
                  min={input.min}
                  max={input.max}
                  step={input.step}
                  value={Number(value)}
                  onChange={(e) =>
                    setValues((s) => ({
                      ...s,
                      [input.id]: Number(e.target.value),
                    }))
                  }
                />
              )}
            </label>
          )
        })}
      </div>
      <div className="what-if-outputs">
        {displayedOutputs.map((output) => (
          <div key={output.id} className={'output' + toneClass(output.color)}>
            <span>{output.label}</span>
            <strong>{output.value}</strong>
          </div>
        ))}
      </div>
      {scenarios.length > 0 && (
        <div className="scenario-note">
          {scenarioMatched ? 'Matched precomputed scenario' : 'Showing baseline outputs'}
        </div>
      )}
      <button type="button" className="btn primary" onClick={submit}>
        {sent ? 'Sent' : (submit_label ?? 'Send scenario')}
      </button>
    </div>
  )
}

function resolveScenarioOutputs(input: {
  inputs: WhatIfComponent['inputs']
  values: Record<string, string | number>
  fallback: WhatIfComponent['outputs']
  scenarios: NonNullable<WhatIfComponent['scenarios']>
}): WhatIfComponent['outputs'] {
  if (input.scenarios.length === 0) return input.fallback

  let best:
    | { distance: number; outputs: WhatIfComponent['outputs'] }
    | null = null

  for (const scenario of input.scenarios) {
    if (!Array.isArray(scenario.outputs)) continue
    const distance = scenarioDistance({
      inputs: input.inputs,
      values: input.values,
      scenarioValues: scenario.input_values,
    })
    if (!best || distance < best.distance) {
      best = {
        distance,
        outputs: scenario.outputs.map((output) => ({
          id: output.id,
          label:
            output.label ??
            input.fallback.find((candidate) => candidate.id === output.id)?.label ??
            output.id,
          value: output.value,
          color:
            output.color ??
            input.fallback.find((candidate) => candidate.id === output.id)?.color,
        })),
      }
    }
  }

  return best?.outputs.length ? best.outputs : input.fallback
}

function scenarioDistance(input: {
  inputs: WhatIfComponent['inputs']
  values: Record<string, string | number>
  scenarioValues: Record<string, string | number>
}): number {
  let total = 0
  for (const control of input.inputs) {
    const current = input.values[control.id] ?? control.value
    const candidate = input.scenarioValues[control.id]
    if (candidate === undefined) {
      total += 10
      continue
    }
    if (typeof current === 'number' && typeof candidate === 'number') {
      const span = Math.max(
        1,
        typeof control.max === 'number' && typeof control.min === 'number'
          ? control.max - control.min
          : Math.max(Math.abs(current), Math.abs(candidate), 1),
      )
      total += Math.abs(current - candidate) / span
      continue
    }
    total += String(current) === String(candidate) ? 0 : 1
  }
  return total
}

export function CAssumptionList({
  items,
  onInteraction,
}: AssumptionListComponent & VocabularyRendererProps): JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<Record<string, string>>({})

  const submit = (id: string): void => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    void onInteraction?.({
      kind: 'assumption.correct',
      component_type: 'assumption_list',
      component_id: id,
      payload: {
        id,
        text: item.text,
        confidence: item.confidence,
        correction: corrections[id] ?? '',
      },
    })
    setEditing(null)
  }

  return (
    <div className="c-assumption-list">
      {items.length === 0 ? (
        <EmptyState label="No assumptions supplied." />
      ) : (
        items.map((item) => (
          <div className="assumption" key={item.id}>
            <div className="assumption-row">
              <ConfidencePip confidence={item.confidence} />
              <span className="text">{item.text}</span>
              {item.correction_prompt && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => setEditing(editing === item.id ? null : item.id)}
                >
                  Correct
                </button>
              )}
            </div>
            {editing === item.id && (
              <div className="correction">
                <textarea
                  rows={2}
                  placeholder={item.correction_prompt}
                  value={corrections[item.id] ?? ''}
                  onChange={(e) =>
                    setCorrections((s) => ({
                      ...s,
                      [item.id]: e.target.value,
                    }))
                  }
                />
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => submit(item.id)}
                >
                  Send correction
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

export function CConfidenceBand({
  value,
  unit,
  label,
  low,
  mid,
  high,
  method,
  color,
}: ConfidenceBandComponent): JSX.Element {
  const hasRange =
    typeof low === 'number' && typeof mid === 'number' && typeof high === 'number'
  const pct = hasRange && high !== low ? clampPct(((mid - low) / (high - low)) * 100) : 50
  return (
    <div className={'c-confidence-band' + toneClass(color)}>
      <div className="band-head">
        <div>
          {label && <div className="vocab-label">{label}</div>}
          <div className="estimate">
            {value}
            {unit && <span>{unit}</span>}
          </div>
        </div>
        {method && <span className="method">{method}</span>}
      </div>
      <div className="band-track">
        <span className="range" />
        <span className="mid" style={{ left: `${pct}%` }} />
      </div>
      {hasRange && (
        <div className="band-scale">
          <span>{low}</span>
          <span>{mid}</span>
          <span>{high}</span>
        </div>
      )}
    </div>
  )
}
