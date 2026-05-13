import { useState, type JSX } from 'react'

import type {
  AgentTasksComponent,
  DeferredListComponent,
  SessionBriefComponent,
} from '@shared/index'
import { ConfidencePip, EmptyState } from './utils'
import type { VocabularyRendererProps } from './types'

export function CSessionBrief({
  goal,
  facts,
  open_threads,
  onInteraction,
}: SessionBriefComponent & VocabularyRendererProps): JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<Record<string, boolean>>({})

  const submit = (factKey: string): void => {
    const fact = facts.find((candidate) => candidate.key === factKey)
    if (!fact) return
    setSent((s) => ({ ...s, [factKey]: true }))
    void onInteraction?.({
      kind: 'session_brief.correct',
      component_type: 'session_brief',
      component_id: factKey,
      payload: {
        key: fact.key,
        previous_value: fact.value,
        correction: corrections[factKey] ?? '',
        correction_prompt: fact.correction_prompt,
      },
    })
    setEditing(null)
  }

  return (
    <div className="c-session-brief">
      {goal && (
        <div className="brief-goal">
          <span className="vocab-label">Goal</span>
          <strong>{goal}</strong>
        </div>
      )}
      {facts.length === 0 ? (
        <EmptyState label="No session facts supplied." />
      ) : (
        <div className="brief-facts">
          {facts.map((fact) => (
            <div className="fact" key={fact.key}>
              <div className="fact-row">
                <span className="key">{fact.key}</span>
                <span className="value">{fact.value}</span>
                <ConfidencePip confidence={fact.confidence} />
                {fact.last_seen && <span className="seen">{fact.last_seen}</span>}
                {fact.correction_prompt && !sent[fact.key] && (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() =>
                      setEditing(editing === fact.key ? null : fact.key)
                    }
                  >
                    Correct
                  </button>
                )}
                {sent[fact.key] && (
                  <span className="status sent">Sent</span>
                )}
              </div>
              {editing === fact.key && (
                <div className="correction">
                  <textarea
                    rows={2}
                    placeholder={fact.correction_prompt}
                    value={corrections[fact.key] ?? ''}
                    onChange={(e) =>
                      setCorrections((s) => ({
                        ...s,
                        [fact.key]: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => submit(fact.key)}
                  >
                    Send correction
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {open_threads && open_threads.length > 0 && (
        <div className="open-threads">
          <span className="vocab-label">Open threads</span>
          {open_threads.map((thread) => (
            <span className="thread" key={thread}>
              {thread}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function CAgentTasks({
  tasks,
  onInteraction,
}: AgentTasksComponent & VocabularyRendererProps): JSX.Element {
  const [sent, setSent] = useState<Record<string, boolean>>({})

  const cancel = (taskId: string): void => {
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task) return
    setSent((s) => ({ ...s, [taskId]: true }))
    void onInteraction?.({
      kind: 'agent_tasks.cancel',
      component_type: 'agent_tasks',
      component_id: taskId,
      payload: {
        id: taskId,
        label: task.label,
        state: task.state,
        cancel_prompt: task.cancel_prompt,
      },
    })
  }

  return (
    <div className="c-agent-tasks">
      {tasks.length === 0 ? (
        <EmptyState label="No agent-declared tasks supplied." />
      ) : (
        tasks.map((task) => (
          <div className={'agent-task ' + task.state} key={task.id}>
            <span className="state-dot" />
            <div className="body">
              <div className="task-head">
                <strong>{task.label}</strong>
                <span className="state">{task.state.replaceAll('_', ' ')}</span>
              </div>
              {task.detail && <p>{task.detail}</p>}
              {task.cadence && <span className="cadence">{task.cadence}</span>}
              {task.cancel_prompt && !sent[task.id] && (
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => cancel(task.id)}
                >
                  Cancel task
                </button>
              )}
              {sent[task.id] && (
                <span className="status sent">Cancellation sent</span>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function CDeferredList({
  items,
  onInteraction,
}: DeferredListComponent & VocabularyRendererProps): JSX.Element {
  const [sent, setSent] = useState<Record<string, boolean>>({})

  const pursue = (key: string, index: number): void => {
    const item = items.find((candidate, i) =>
      candidate.id === key || (!candidate.id && String(i) === key),
    )
    if (!item) return
    setSent((s) => ({ ...s, [key]: true }))
    void onInteraction?.({
      kind: 'deferred_list.pursue',
      component_type: 'deferred_list',
      component_id: item.id,
      payload: {
        index,
        text: item.text,
        reason: item.reason,
        pursue_prompt: item.pursue_prompt,
      },
    })
  }

  return (
    <div className="c-deferred-list">
      {items.length === 0 ? (
        <EmptyState label="No deferred items supplied." />
      ) : (
        items.map((item, index) => {
          const key = item.id ?? String(index)
          return (
            <div className="deferred-item" key={key}>
              <span className="idx">{index + 1}</span>
              <div className="body">
                <strong>{item.text}</strong>
                <p>{item.reason}</p>
                {item.pursue_prompt && !sent[key] && (
                  <button
                    type="button"
                    className="mini-btn"
                    onClick={() => pursue(key, index)}
                  >
                    Pursue
                  </button>
                )}
                {sent[key] && (
                  <span className="status sent">Pursue sent</span>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
