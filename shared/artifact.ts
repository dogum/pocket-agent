// =====================================================================
// Artifact Schema — the contract between the agent and the app renderer.
// The agent emits valid Artifact JSON. The web app renders it via the
// ArtifactRenderer, which switches on `type` for each component.
//
// Adding a new component type? Update three places in lockstep:
//   1. Add the interface here and to the ArtifactComponent union.
//   2. Add a renderer in web/src/components/artifact/.
//   3. Document it in the agent system prompt so the agent will emit it.
// =====================================================================

export type ThemeColor = 'signal' | 'cool' | 'green' | 'amber' | 'red' | 'muted'
export type Trend = 'up' | 'down' | 'flat' | 'warn'
export type Priority = 'high' | 'normal' | 'low'
export type ComponentConfidence = 'low' | 'medium' | 'high'
export type ComponentState = 'pending' | 'active' | 'complete' | 'blocked' | 'skipped'
export type WorkState =
  | 'running'
  | 'scheduled'
  | 'waiting_on_user'
  | 'waiting_on_external'
  | 'paused'
  | 'done'

// ─── Actions ─────────────────────────────────────────────────────────
export type ActionType =
  | 'confirm' // accept or approve a recommendation
  | 'follow_up' // send a follow-up prompt back into the session
  | 'export' // generate a shareable/downloadable version
  | 'share' // native share sheet
  | 'dismiss' // archive this artifact
  | 'navigate' // deep-link to another artifact or session
  | 'external_link' // open a URL in the browser

export interface ArtifactAction {
  label: string
  action: ActionType
  primary?: boolean
  /** For follow_up: the prompt sent back to the agent. */
  prompt?: string
  /** For navigate: target artifact or session id. */
  target_id?: string
  /** For external_link: URL to open. */
  url?: string
}

// ─── Components ──────────────────────────────────────────────────────
export interface DataRowComponent {
  type: 'data_row'
  cells: Array<{
    value: string
    label: string
    color?: ThemeColor
    trend?: Trend
  }>
}

export interface ParagraphComponent {
  type: 'paragraph'
  text: string
  emphasis?: boolean
}

export interface HeadingComponent {
  type: 'heading'
  text: string
  level?: 2 | 3
}

export interface SparklineComponent {
  type: 'sparkline'
  values: number[]
  labels?: string[]
  thresholds?: Array<{ above: number; color: ThemeColor }>
  base_color?: ThemeColor
}

export interface LineChartComponent {
  type: 'line_chart'
  series: Array<{
    name: string
    values: number[]
    color?: ThemeColor
  }>
  x_labels: string[]
  y_label?: string
}

export interface BarChartComponent {
  type: 'bar_chart'
  groups: Array<{
    label: string
    values: Array<{
      name: string
      value: number
      color?: ThemeColor
    }>
  }>
}

export interface TableComponent {
  type: 'table'
  headers: string[]
  rows: Array<{
    cells: string[]
    /** Optional per-cell color overrides keyed by column index. */
    colors?: Record<number, ThemeColor>
  }>
}

export interface QuoteComponent {
  type: 'quote'
  text: string
  attribution?: string
  color?: ThemeColor
}

export interface AlertComponent {
  type: 'alert'
  severity: 'info' | 'warning' | 'critical'
  title?: string
  text: string
}

export interface TimelineComponent {
  type: 'timeline'
  segments: Array<{
    label: string
    /** Relative duration weight; 3 means 3× the width of 1. */
    duration: number
    color?: ThemeColor
    status?: 'complete' | 'active' | 'pending' | 'blocked'
  }>
}

export interface ProgressComponent {
  type: 'progress'
  items: Array<{
    label: string
    value: number
    max: number
    color?: ThemeColor
  }>
  display?: 'ring' | 'bar'
}

export interface SourcesComponent {
  type: 'sources'
  items: string[]
}

export interface StatusListComponent {
  type: 'status_list'
  items: Array<{
    icon?: string // emoji
    label: string
    value: string
    color?: ThemeColor
  }>
}

export interface ImageComponent {
  type: 'image'
  url: string
  caption?: string
  aspect?: '16:9' | '4:3' | '1:1' | 'auto'
}

export interface HtmlEmbedComponent {
  type: 'html_embed'
  /** Sanitized HTML rendered in a sandboxed iframe. */
  content: string
  height?: number
}

export interface ChecklistComponent {
  type: 'checklist'
  items: Array<{
    id: string
    text: string
    checked: boolean
    action?: {
      type: 'follow_up'
      prompt: string
    }
  }>
}

export interface ComponentFollowUpAction {
  type: 'follow_up'
  prompt: string
}

export interface ComparisonComponent {
  type: 'comparison'
  items: Array<{
    name: string
    metrics: Record<string, string | number>
    highlight?: boolean
    color?: ThemeColor
  }>
}

export interface DividerComponent {
  type: 'divider'
}

export interface MapComponent {
  type: 'map'
  center: { lat: number; lng: number }
  zoom?: number
  markers?: Array<{
    lat: number
    lng: number
    label?: string
    color?: ThemeColor
  }>
}

/** Open-ended typed questions the user can answer inline. The renderer
 *  collects values and dispatches them as a single follow-up reply
 *  back to the same managed session. Use this when you need actual
 *  input, not just check-off acknowledgement. */
export interface QuestionSetComponent {
  type: 'question_set'
  questions: Array<{
    id: string
    /** What you're asking. Renders as the field label. */
    label: string
    /** Hint text shown inside the empty input. */
    placeholder?: string
    /** Optional helper line beneath the field. */
    hint?: string
    /** Render a multi-line textarea instead of a single-line input. */
    multiline?: boolean
  }>
  /** Override the default "Submit answers" button label. */
  submit_label?: string
}

/** Rich-text prose with formatting (bold, italics, lists, inline code,
 *  links). Sandboxed via marked + DOMPurify. Use when `paragraph` is
 *  too plain — e.g. a draft section, a report intro, a structured
 *  explanation. */
export interface MarkdownComponent {
  type: 'markdown'
  /** CommonMark markdown. Sanitized at render time. */
  content: string
}

/** Compact key/value rows. Lighter than `table`, denser than `data_row`.
 *  Good for "specs" — scope, dimensions, parameters, mileage breakdowns. */
export interface KeyValueListComponent {
  type: 'key_value_list'
  items: Array<{
    key: string
    value: string
    color?: ThemeColor
  }>
}

/** A cited URL rendered as a link card. Use for source citations,
 *  external references, the user's link ingests after the agent has
 *  read them. */
export interface LinkPreviewComponent {
  type: 'link_preview'
  url: string
  title?: string
  description?: string
  /** Surfaced in the corner of the card. Falls back to URL host. */
  domain?: string
}

export interface CalculationComponent {
  type: 'calculation'
  label?: string
  steps: Array<{
    id?: string
    label: string
    expression?: string
    value: string
    emphasis?: boolean
  }>
  result?: {
    label: string
    value: string
    color?: ThemeColor
  }
}

export interface WhatIfComponent {
  type: 'what_if'
  label?: string
  inputs: Array<{
    id: string
    label: string
    kind: 'choice' | 'slider' | 'number'
    value: string | number
    choices?: string[]
    min?: number
    max?: number
    step?: number
    unit?: string
  }>
  outputs: Array<{
    id: string
    label: string
    value: string
    color?: ThemeColor
  }>
  submit_label?: string
}

export interface AssumptionListComponent {
  type: 'assumption_list'
  items: Array<{
    id: string
    text: string
    confidence?: ComponentConfidence
    correction_prompt?: string
  }>
}

export interface ConfidenceBandComponent {
  type: 'confidence_band'
  value: string
  unit?: string
  label?: string
  low?: number
  mid?: number
  high?: number
  method?: string
  color?: ThemeColor
}

export interface CounterProposalComponent {
  type: 'counter_proposal'
  intro?: string
  segments: Array<{
    id: string
    label: string
    proposal: string
    state?: 'pending' | 'accepted' | 'modified' | 'rejected'
    modified_text?: string
    reject_reason?: string
  }>
  submit_label?: string
}

export interface TradeoffSliderComponent {
  type: 'tradeoff_slider'
  question: string
  left: { label: string; description?: string }
  right: { label: string; description?: string }
  value: number
  min?: number
  max?: number
  note?: string
  submit_label?: string
}

export interface DraftReviewComponent {
  type: 'draft_review'
  title?: string
  recipient?: string
  body: string
  uncertain_spans?: Array<{
    id: string
    text: string
    reason?: string
  }>
  submit_label?: string
}

export interface PlanCardComponent {
  type: 'plan_card'
  goal?: string
  steps: Array<{
    id: string
    title: string
    detail?: string
    state: 'done' | 'doing' | 'pending' | 'blocked' | 'skipped'
    ask?: {
      id: string
      label: string
      placeholder?: string
      value?: string
    }
  }>
}

export interface DecisionTreeComponent {
  type: 'decision_tree'
  question: string
  branches: Array<{
    id: string
    choice: string
    next_question?: string
    conclusion?: string
    color?: ThemeColor
  }>
  submit_label?: string
}

export interface CheckpointComponent {
  type: 'checkpoint'
  stages: Array<{
    id: string
    label: string
    state: 'done' | 'current' | 'pending' | 'blocked'
  }>
  current_status?: string
  next_unblock?: string
}

export interface SchedulePickerComponent {
  type: 'schedule_picker'
  question?: string
  slots: Array<{
    id: string
    date_label: string
    time_range: string
    note?: string
    preferred?: boolean
    source?: string
  }>
  allow_other?: boolean
  submit_label?: string
}

export interface CalendarViewComponent {
  type: 'calendar_view'
  title?: string
  range_label?: string
  days: Array<{
    id: string
    name: string
    number: string
    today?: boolean
    events?: Array<{
      id: string
      time?: string
      label: string
      state?: 'planned' | 'done' | 'missed' | 'tentative'
    }>
  }>
}

export interface HeatmapComponent {
  type: 'heatmap'
  title?: string
  streak_label?: string
  month_labels?: string[]
  day_labels?: string[]
  values: Array<{
    date: string
    value: number
  }>
  max?: number
}

export interface TriggerProposalComponent {
  type: 'trigger_proposal'
  rationale?: string
  cadence_label: string
  cron: string
  action: string
  alternatives?: Array<{
    label: string
    cron: string
  }>
}

export interface AnnotatedTextComponent {
  type: 'annotated_text'
  source_label?: string
  content: string
  annotations?: Array<{
    id: string
    text: string
    note: string
    color?: ThemeColor
  }>
}

export interface DiffComponent {
  type: 'diff'
  before_label?: string
  after_label?: string
  before: string
  after: string
}

export interface TranscriptComponent {
  type: 'transcript'
  source_label?: string
  lines: Array<{
    id: string
    time?: string
    speaker?: string
    text: string
    pinned?: boolean
    note?: string
  }>
}

export interface AnnotatedImageComponent {
  type: 'annotated_image'
  url?: string
  caption?: string
  pins: Array<{
    id: string
    x: number
    y: number
    label: string
    note?: string
    color?: ThemeColor
  }>
}

export interface SessionBriefComponent {
  type: 'session_brief'
  goal?: string
  facts: Array<{
    key: string
    value: string
    confidence?: ComponentConfidence
    last_seen?: string
    correction_prompt?: string
  }>
  open_threads?: string[]
}

export interface AgentTasksComponent {
  type: 'agent_tasks'
  tasks: Array<{
    id: string
    label: string
    state: WorkState
    cadence?: string
    detail?: string
    cancel_prompt?: string
  }>
}

export interface DeferredListComponent {
  type: 'deferred_list'
  items: Array<{
    id?: string
    text: string
    reason: string
    pursue_prompt?: string
  }>
}

export interface DecisionMatrixComponent {
  type: 'decision_matrix'
  options: string[]
  criteria: Array<{
    id: string
    label: string
    weight: number
    scores: Record<string, number>
  }>
  recommended_option?: string
  rationale?: string
}

export interface ProsConsComponent {
  type: 'pros_cons'
  question?: string
  pros: Array<{ text: string; weight?: number }>
  cons: Array<{ text: string; weight?: number }>
  recommendation?: string
}

export interface RankingComponent {
  type: 'ranking'
  question?: string
  items: Array<{
    id: string
    label: string
    rationale?: string
  }>
  submit_label?: string
}

export interface TimerComponent {
  type: 'timer'
  id: string
  label: string
  duration_seconds: number
  elapsed_seconds?: number
  mode?: 'countdown' | 'countup'
  completion_prompt?: string
}

export interface CounterComponent {
  type: 'counter'
  id: string
  label: string
  value: number
  target?: number
  unit?: string
  submit_label?: string
}

export interface ScratchpadComponent {
  type: 'scratchpad'
  id: string
  title?: string
  content: string
  shared_with_agent?: boolean
  privacy_note?: string
}

export interface NetworkComponent {
  type: 'network'
  nodes: Array<{
    id: string
    label: string
    kind?: string
    color?: ThemeColor
  }>
  edges: Array<{
    from: string
    to: string
    label?: string
    kind?: 'supports' | 'contradicts' | 'cites' | 'depends_on' | 'related'
    color?: ThemeColor
  }>
}

export interface TreeComponent {
  type: 'tree'
  root_label?: string
  nodes: Array<{
    id: string
    label: string
    parent_id?: string
    value?: string
    color?: ThemeColor
  }>
}

export interface SankeyComponent {
  type: 'sankey'
  nodes: Array<{ id: string; label: string }>
  flows: Array<{
    from: string
    to: string
    value: number
    label?: string
    color?: ThemeColor
  }>
}

/** A reflex (agent-authored watcher) the agent is proposing the user
 *  approve. Once approved, the reflex fires automatically when matching
 *  observations arrive on the named source. Approval / dismissal happens
 *  inline in the artifact card; no separate flow.
 *
 *  Propose reflexes SPARINGLY — only after a pattern has clearly
 *  repeated — and make them specific enough that the user can approve
 *  without thinking hard. */
export interface ReflexProposalComponent {
  type: 'reflex_proposal'
  /** Plain-language description ("when energy drops below 30 in the morning"). */
  description: string
  /** Source slug the proposal listens to. The web client resolves it to a Source row. */
  source_name: string
  /** AND of all conditions. Empty array → match every observation. */
  conditions: import('./source.js').ReflexCondition[]
  /** Prompt sent to the agent when the reflex fires. */
  kickoff_prompt: string
  /** Optional artifact-type hint (e.g. "alert", "plan"). */
  artifact_hint?: string
  /** Minimum seconds between fires. Defaults to 300 (5 min). */
  debounce_seconds?: number
}

export type ArtifactComponent =
  | DataRowComponent
  | ParagraphComponent
  | HeadingComponent
  | SparklineComponent
  | LineChartComponent
  | BarChartComponent
  | TableComponent
  | QuoteComponent
  | AlertComponent
  | TimelineComponent
  | ProgressComponent
  | SourcesComponent
  | StatusListComponent
  | ImageComponent
  | HtmlEmbedComponent
  | ChecklistComponent
  | ComparisonComponent
  | DividerComponent
  | MapComponent
  | QuestionSetComponent
  | MarkdownComponent
  | KeyValueListComponent
  | LinkPreviewComponent
  | CalculationComponent
  | WhatIfComponent
  | AssumptionListComponent
  | ConfidenceBandComponent
  | CounterProposalComponent
  | TradeoffSliderComponent
  | DraftReviewComponent
  | PlanCardComponent
  | DecisionTreeComponent
  | CheckpointComponent
  | SchedulePickerComponent
  | CalendarViewComponent
  | HeatmapComponent
  | TriggerProposalComponent
  | AnnotatedTextComponent
  | DiffComponent
  | TranscriptComponent
  | AnnotatedImageComponent
  | SessionBriefComponent
  | AgentTasksComponent
  | DeferredListComponent
  | DecisionMatrixComponent
  | ProsConsComponent
  | RankingComponent
  | TimerComponent
  | CounterComponent
  | ScratchpadComponent
  | NetworkComponent
  | TreeComponent
  | SankeyComponent
  | ReflexProposalComponent

// ─── Artifact ────────────────────────────────────────────────────────
export interface ArtifactHeader {
  /** Category label rendered in mono caps (ALERT, REPORT, SYNTHESIS, …). */
  label: string
  /** Serif headline. */
  title: string
  /** One-line summary shown beneath the title. */
  summary?: string
  /** Human-readable relative timestamp ("2h ago", "yesterday", "Just now"). */
  timestamp_display: string
  label_color?: ThemeColor
}

export interface Artifact {
  id: string
  session_id: string
  /** ISO 8601. */
  created_at: string
  priority: Priority
  notify: boolean
  header: ArtifactHeader
  components: ArtifactComponent[]
  actions?: ArtifactAction[]
  /** When set, observations from these sources matching the conditions
   *  trigger an in-place re-run that updates this artifact. The prior
   *  state lands in `artifact_versions` for the history sheet. */
  subscribes_to?: import('./source.js').ArtifactSubscription[]
  /** Number of in-place updates since creation. Set by the server. */
  version?: number
  /** ISO of the most recent in-place update, if any. Set by the server. */
  last_updated_at?: string
}

/**
 * The raw shape the agent is asked to emit. The server adds id, session_id,
 * and created_at; the agent never invents those.
 */
export type ArtifactDraft = Omit<
  Artifact,
  'id' | 'session_id' | 'created_at' | 'version' | 'last_updated_at'
>

// ─── Briefing ────────────────────────────────────────────────────────
export interface Briefing {
  id: string
  session_id: string
  user_id: string
  /** Serif headline; <em> wraps accent words. */
  greeting_html: string
  summary: string
  active_session?: {
    name: string
    status_text: string
  }
  created_at: string
}
