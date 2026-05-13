import type { Artifact, ArtifactComponent } from '@shared/index'

export type ArtifactInteractionKind =
  | 'assumption.correct'
  | 'counter_proposal.submit'
  | 'tradeoff_slider.submit'
  | 'what_if.submit'
  | 'draft_review.submit'
  | 'ranking.submit'
  | 'schedule_picker.pick'
  | 'trigger_proposal.approve'
  | 'timer.complete'
  | 'counter.submit'
  | 'scratchpad.save'
  | 'decision_tree.submit'
  | 'session_brief.correct'
  | 'agent_tasks.cancel'
  | 'deferred_list.pursue'

export interface ArtifactInteractionPayload {
  kind: ArtifactInteractionKind
  component_type: ArtifactComponent['type']
  component_id?: string
  payload: unknown
}

export type ArtifactInteractionHandler = (
  interaction: ArtifactInteractionPayload,
) => void | Promise<void>

export function buildArtifactInteractionPrompt(input: {
  artifact: Artifact
  interaction: ArtifactInteractionPayload
}): string {
  return [
    `The user interacted with artifact "${input.artifact.header.title}".`,
    '',
    `Artifact id: ${input.artifact.id}`,
    `Component: ${input.interaction.component_type}`,
    `Interaction: ${input.interaction.kind}`,
    '',
    'Structured payload:',
    JSON.stringify(input.interaction.payload, null, 2),
    '',
    'Update the session using this response. Produce the next most useful artifact.',
  ].join('\n')
}
