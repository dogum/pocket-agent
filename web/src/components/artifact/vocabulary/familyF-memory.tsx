import type { JSX } from 'react'

import type {
  AgentTasksComponent,
  DeferredListComponent,
  SessionBriefComponent,
} from '@shared/index'
import { ConfidencePip, EmptyState } from './utils'

export function CSessionBrief({
  goal,
  facts,
  open_threads,
}: SessionBriefComponent): JSX.Element {
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
              <span className="key">{fact.key}</span>
              <span className="value">{fact.value}</span>
              <ConfidencePip confidence={fact.confidence} />
              {fact.last_seen && <span className="seen">{fact.last_seen}</span>}
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

export function CAgentTasks({ tasks }: AgentTasksComponent): JSX.Element {
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
            </div>
          </div>
        ))
      )}
    </div>
  )
}

export function CDeferredList({ items }: DeferredListComponent): JSX.Element {
  return (
    <div className="c-deferred-list">
      {items.length === 0 ? (
        <EmptyState label="No deferred items supplied." />
      ) : (
        items.map((item, index) => (
          <div className="deferred-item" key={item.id ?? index}>
            <span className="idx">{index + 1}</span>
            <div>
              <strong>{item.text}</strong>
              <p>{item.reason}</p>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
