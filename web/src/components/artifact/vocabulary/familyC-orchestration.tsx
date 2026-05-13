import { useState, type JSX } from 'react'

import type {
  CheckpointComponent,
  DecisionTreeComponent,
  PlanCardComponent,
} from '@shared/index'
import type { VocabularyRendererProps } from './types'

export function CPlanCard({ goal, steps }: PlanCardComponent): JSX.Element {
  return (
    <div className="c-plan-card">
      {goal && <div className="plan-goal">{goal}</div>}
      {steps.map((step, index) => (
        <div className={'plan-step ' + step.state} key={step.id}>
          <span className="idx">{index + 1}</span>
          <div className="body">
            <div className="step-head">
              <strong>{step.title}</strong>
              <span>{step.state}</span>
            </div>
            {step.detail && <p>{step.detail}</p>}
            {step.ask && (
              <label className="step-ask">
                <span>{step.ask.label}</span>
                <input
                  type="text"
                  placeholder={step.ask.placeholder}
                  defaultValue={step.ask.value}
                />
              </label>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CDecisionTree({
  question,
  branches,
  submit_label,
  onInteraction,
}: DecisionTreeComponent & VocabularyRendererProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const branch = branches.find((candidate) => candidate.id === selected)

  const submit = (): void => {
    if (!branch) return
    setSent(true)
    void onInteraction?.({
      kind: 'decision_tree.submit',
      component_type: 'decision_tree',
      component_id: branch.id,
      payload: branch,
    })
  }

  return (
    <div className="c-decision-tree">
      <div className="tree-question">{question}</div>
      <div className="tree-branches">
        {branches.map((candidate) => (
          <button
            type="button"
            key={candidate.id}
            className={selected === candidate.id ? 'branch selected' : 'branch'}
            onClick={() => setSelected(candidate.id)}
          >
            {candidate.choice}
          </button>
        ))}
      </div>
      {branch && (
        <div className="tree-result">
          {branch.next_question && <p>{branch.next_question}</p>}
          {branch.conclusion && <strong>{branch.conclusion}</strong>}
        </div>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={submit}
        disabled={!branch}
      >
        {sent ? 'Sent' : (submit_label ?? 'Submit choice')}
      </button>
    </div>
  )
}

export function CCheckpoint({
  stages,
  current_status,
  next_unblock,
}: CheckpointComponent): JSX.Element {
  return (
    <div className="c-checkpoint">
      <div className="checkpoint-track">
        {stages.map((stage) => (
          <div className={'stage ' + stage.state} key={stage.id}>
            <span className="dot" />
            <span>{stage.label}</span>
          </div>
        ))}
      </div>
      {(current_status || next_unblock) && (
        <div className="checkpoint-copy">
          {current_status && <strong>{current_status}</strong>}
          {next_unblock && <span>{next_unblock}</span>}
        </div>
      )}
    </div>
  )
}
