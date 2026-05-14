import type {
  Artifact,
  ArtifactAction,
  ReflexProposalComponent,
  Session,
} from '@shared/index'
import type { ArtifactInteractionPayload } from '../../lib/artifactInteractions'

export interface ArtifactDetailSurfaceProps {
  artifact: Artifact
  session?: Session
  actionFeedback: string | null
  onBack: () => void
  onSessionOpen: (sessionId: string) => void
  onReply: () => void
  onAction: (action: ArtifactAction) => void | Promise<void>
  onQuestionSetSubmit: (
    answers: Array<{ id: string; label: string; value: string }>,
  ) => void
  onInteraction: (interaction: ArtifactInteractionPayload) => void
  onReflexApprove: (proposal: ReflexProposalComponent) => void | Promise<void>
  onShowHistory: () => void
}
