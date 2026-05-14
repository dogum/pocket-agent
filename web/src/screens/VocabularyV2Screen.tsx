import { useMemo, useState, type JSX } from 'react'

import { ArtifactCard, ArtifactDetail } from '../components/artifact/ArtifactRenderer'
import { ScreenHead } from '../components/shell/Shell'
import { vocabularyV2Artifacts } from '../fixtures/vocabularyV2'
import type { ArtifactInteractionPayload } from '../lib/artifactInteractions'
import { useAppStore } from '../store/useAppStore'

export function VocabularyV2Screen(): JSX.Element {
  const back = useAppStore((s) => s.back)
  const [selectedId, setSelectedId] = useState(vocabularyV2Artifacts[0].id)
  const [feedback, setFeedback] = useState<string | null>(null)
  const artifact = useMemo(
    () =>
      vocabularyV2Artifacts.find((candidate) => candidate.id === selectedId) ??
      vocabularyV2Artifacts[0],
    [selectedId],
  )

  const handleInteraction = (interaction: ArtifactInteractionPayload): void => {
    setFeedback(
      `${interaction.kind}: ${JSON.stringify(interaction.payload).slice(0, 140)}`,
    )
  }

  return (
    <div className="screen enter" data-screen-label="Showing the work">
      <ScreenHead onBack={back} title="Showing the work" />
      <div className="vocab-review">
        <div className="vocab-review-intro rise">
          <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 6 }}>
            30 thinking components
          </div>
          <h1>
            Showing the <em>work</em>
          </h1>
          <p>
            When the agent has more to say than a chart and a paragraph —
            when it needs to derive a number, surface the assumptions it's
            standing on, show a range instead of a single point, or propose
            a plan you can modify in parts — it reaches for these
            components. Tap each card to see it rendered the way it ships
            in the feed.
          </p>
        </div>

        <div className="vocab-fixture-list">
          {vocabularyV2Artifacts.map((candidate) => (
            <ArtifactCard
              key={candidate.id}
              artifact={candidate}
              dense
              onTap={() => {
                setSelectedId(candidate.id)
                setFeedback(null)
              }}
            />
          ))}
        </div>

        <div className="vocab-review-detail">
          <ArtifactDetail
            artifact={artifact}
            onInteraction={handleInteraction}
            onQuestionSetSubmit={() => undefined}
          />
        </div>

        {feedback && (
          <div className="vocab-review-feedback">
            <span className="vocab-label">Last interaction payload</span>
            <code>{feedback}</code>
          </div>
        )}
      </div>
    </div>
  )
}
