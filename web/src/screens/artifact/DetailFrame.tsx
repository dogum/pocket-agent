import type { JSX, ReactNode } from 'react'

import { ArtifactDetail } from '../../components/artifact/ArtifactRenderer'
import { Icon } from '../../components/icons/Icon'
import { ScreenHead } from '../../components/shell/Shell'
import type { ArtifactDetailSurfaceProps } from './types'

export function DetailFrame({
  mode,
  screenTitle,
  eyebrow,
  meta,
  children,
  props,
}: {
  mode: 'journal' | 'edition' | 'observatory' | 'workbench' | 'atrium'
  screenTitle: string
  eyebrow: string
  meta: ReactNode
  children?: ReactNode
  props: ArtifactDetailSurfaceProps
}): JSX.Element {
  const { artifact, session } = props
  return (
    <div
      className={`screen enter artifact-detail-surface detail-${mode}`}
      data-screen-label="02 Artifact Detail"
    >
      <ScreenHead onBack={props.onBack} title={screenTitle} />
      <div className="detail-chrome">
        <div className="detail-eyebrow">{eyebrow}</div>
        <div className="detail-meta">{meta}</div>
        {children}
      </div>
      <ArtifactDetail
        artifact={artifact}
        onAction={props.onAction}
        onQuestionSetSubmit={props.onQuestionSetSubmit}
        onInteraction={props.onInteraction}
        onReflexApprove={props.onReflexApprove}
        onShowHistory={props.onShowHistory}
      />

      <div className="detail-reply-row">
        <button
          type="button"
          className="btn primary"
          onClick={props.onReply}
          style={{ flex: 1 }}
        >
          <Icon name="pen" size={14} />
          Reply
        </button>
      </div>

      {props.actionFeedback && (
        <div className="detail-feedback">
          <Icon name="check" size={12} />
          <span className="t-body-sm">{props.actionFeedback}</span>
        </div>
      )}

      {session && (
        <div className="detail-session-link">
          <Icon name="orbit" size={12} />
          <span className="t-caption">
            From{' '}
            <button
              type="button"
              onClick={() => props.onSessionOpen(session.id)}
            >
              {session.name}
            </button>
          </span>
        </div>
      )}
    </div>
  )
}
