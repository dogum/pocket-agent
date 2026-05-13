import type { JSX } from 'react'

import type {
  AnnotatedImageComponent,
  AnnotatedTextComponent,
  DiffComponent,
  TranscriptComponent,
} from '@shared/index'
import { toneClass } from './utils'

export function CAnnotatedText({
  source_label,
  content = '',
  annotations = [],
}: AnnotatedTextComponent): JSX.Element {
  return (
    <div className="c-annotated-text">
      {source_label && <div className="vocab-label">{source_label}</div>}
      <div className="annotated-copy">{markAnnotatedText(content, annotations)}</div>
      {annotations.length > 0 && (
        <div className="annotation-notes">
          {annotations.map((annotation) => (
            <div
              className={'note' + toneClass(annotation.color)}
              key={annotation.id}
            >
              <strong>{annotation.text}</strong>
              <span>{annotation.note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function CDiff({
  before_label = 'Before',
  after_label = 'After',
  before = '',
  after = '',
}: DiffComponent): JSX.Element {
  return (
    <div className="c-diff">
      <div className="diff-pane before">
        <span className="vocab-label">{before_label}</span>
        <pre>{before}</pre>
      </div>
      <div className="diff-pane after">
        <span className="vocab-label">{after_label}</span>
        <pre>{after}</pre>
      </div>
    </div>
  )
}

export function CTranscript({
  source_label,
  lines,
}: TranscriptComponent): JSX.Element {
  return (
    <div className="c-transcript">
      {source_label && <div className="vocab-label">{source_label}</div>}
      {lines.map((line) => (
        <div className={line.pinned ? 'line pinned' : 'line'} key={line.id}>
          <span className="time">{line.time ?? ''}</span>
          <div>
            {line.speaker && <strong>{line.speaker}</strong>}
            <p>{line.text}</p>
            {line.note && <span className="note">{line.note}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

export function CAnnotatedImage({
  url,
  caption,
  pins,
}: AnnotatedImageComponent): JSX.Element {
  return (
    <div className="c-annotated-image">
      <div className="image-stage">
        {url ? <img src={url} alt={caption ?? ''} /> : <div className="placeholder" />}
        {pins.map((pin, index) => (
          <span
            className={'pin' + toneClass(pin.color)}
            key={pin.id}
            style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
            title={pin.note}
          >
            {index + 1}
          </span>
        ))}
      </div>
      {caption && <p className="caption">{caption}</p>}
      <div className="pin-legend">
        {pins.map((pin, index) => (
          <div key={pin.id}>
            <span>{index + 1}</span>
            <strong>{pin.label}</strong>
            {pin.note && <p>{pin.note}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

function markAnnotatedText(
  content: string,
  annotations: NonNullable<AnnotatedTextComponent['annotations']>,
): JSX.Element[] {
  if (annotations.length === 0) return [<span key="content">{content}</span>]
  const parts: JSX.Element[] = []
  const ordered = annotations
    .map((annotation) => ({
      ...annotation,
      index: content.indexOf(annotation.text),
    }))
    .filter((annotation) => annotation.index >= 0)
    .sort((a, b) => a.index - b.index)
  let cursor = 0
  let key = 0
  for (const annotation of ordered) {
    if (annotation.index < cursor) continue
    if (annotation.index > cursor) {
      parts.push(<span key={key++}>{content.slice(cursor, annotation.index)}</span>)
    }
    parts.push(
      <mark
        key={key++}
        className={annotation.color ?? ''}
        title={annotation.note}
      >
        {annotation.text}
      </mark>,
    )
    cursor = annotation.index + annotation.text.length
  }
  if (cursor < content.length) {
    parts.push(<span key={key++}>{content.slice(cursor)}</span>)
  }
  return parts
}
