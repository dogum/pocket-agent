import { useState, type JSX } from 'react'

import type {
  CheckpointComponent,
  DecisionTreeComponent,
  PlanCardComponent,
} from '@shared/index'
import type { VocabularyRendererProps } from './types'

export function CPlanCard({
  goal,
  steps,
  submit_label,
  onInteraction,
}: PlanCardComponent & VocabularyRendererProps): JSX.Element {
  const askSteps = steps.filter((step) => step.ask)
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      askSteps.map((step) => [step.ask!.id, step.ask!.value ?? '']),
    ),
  )
  const [sent, setSent] = useState(false)
  const [doneSent, setDoneSent] = useState<Record<string, boolean>>({})

  const submitAsks = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'plan_card.submit',
      component_type: 'plan_card',
      payload: {
        goal,
        answers: askSteps.map((step) => ({
          step_id: step.id,
          step_title: step.title,
          ask_id: step.ask!.id,
          label: step.ask!.label,
          value: answers[step.ask!.id] ?? '',
        })),
      },
    })
  }

  const markDone = (step: PlanCardComponent['steps'][number]): void => {
    setDoneSent((current) => ({ ...current, [step.id]: true }))
    void onInteraction?.({
      kind: 'plan_card.step_done',
      component_type: 'plan_card',
      component_id: step.id,
      payload: {
        step_id: step.id,
        title: step.title,
        detail: step.detail,
        prompt: step.on_done?.prompt,
      },
    })
  }

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
                {step.ask.kind === 'choice' && step.ask.options?.length ? (
                  <select
                    value={answers[step.ask.id] ?? ''}
                    onChange={(e) =>
                      setAnswers((current) => ({
                        ...current,
                        [step.ask!.id]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Choose...</option>
                    {step.ask.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : step.ask.kind === 'confirm' ? (
                  <div className="step-confirm">
                    <input
                      type="checkbox"
                      checked={answers[step.ask.id] === 'confirmed'}
                      onChange={(e) =>
                        setAnswers((current) => ({
                          ...current,
                          [step.ask!.id]: e.target.checked ? 'confirmed' : '',
                        }))
                      }
                    />
                    <span>Confirm</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder={step.ask.placeholder}
                    value={answers[step.ask.id] ?? ''}
                    onChange={(e) =>
                      setAnswers((current) => ({
                        ...current,
                        [step.ask!.id]: e.target.value,
                      }))
                    }
                  />
                )}
              </label>
            )}
            {step.on_done && !doneSent[step.id] && (
              <button
                type="button"
                className="mini-btn plan-step-done"
                onClick={() => markDone(step)}
              >
                Mark done
              </button>
            )}
            {doneSent[step.id] && <span className="status sent">Done sent</span>}
          </div>
        </div>
      ))}
      {askSteps.length > 0 && (
        <button type="button" className="btn primary" onClick={submitAsks}>
          {sent ? 'Sent' : (submit_label ?? 'Submit plan answers')}
        </button>
      )}
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
