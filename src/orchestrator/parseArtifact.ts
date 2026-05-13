// =====================================================================
// parseArtifact — validate the agent's final text as a valid Artifact draft.
//
// The system prompt tells the agent to emit one JSON object as its final
// message. Reality is messier: agents sometimes wrap JSON in markdown
// fences, add a leading sentence, or trail commentary. This parser
// gracefully extracts the JSON, then validates against the schema.
//
// Returns either a normalized ArtifactDraft, or a parse error with
// enough info that the run.error event can blame the right issue.
// =====================================================================

import type {
  ArtifactComponent,
  ArtifactDraft,
  ArtifactAction,
  ArtifactSubscription,
  Priority,
  ReflexCondition,
  ReflexOp,
  ThemeColor,
  Trend,
} from '../../shared/index.js'

export type ParseResult =
  | { ok: true; draft: ArtifactDraft }
  | { ok: false; error: string }

const VALID_PRIORITY = new Set<Priority>(['high', 'normal', 'low'])
const VALID_COLORS = new Set<ThemeColor>([
  'signal',
  'cool',
  'green',
  'amber',
  'red',
  'muted',
])
const VALID_TRENDS = new Set<Trend>(['up', 'down', 'flat', 'warn'])
const VALID_COMPONENT_TYPES = new Set([
  'data_row',
  'paragraph',
  'heading',
  'sparkline',
  'line_chart',
  'bar_chart',
  'table',
  'quote',
  'alert',
  'timeline',
  'progress',
  'sources',
  'status_list',
  'image',
  'html_embed',
  'checklist',
  'comparison',
  'divider',
  'map',
  'question_set',
  'markdown',
  'key_value_list',
  'link_preview',
  'calculation',
  'what_if',
  'assumption_list',
  'confidence_band',
  'counter_proposal',
  'tradeoff_slider',
  'draft_review',
  'plan_card',
  'decision_tree',
  'checkpoint',
  'schedule_picker',
  'calendar_view',
  'heatmap',
  'trigger_proposal',
  'annotated_text',
  'diff',
  'transcript',
  'annotated_image',
  'session_brief',
  'agent_tasks',
  'deferred_list',
  'decision_matrix',
  'pros_cons',
  'ranking',
  'timer',
  'counter',
  'scratchpad',
  'network',
  'tree',
  'sankey',
  'reflex_proposal',
])

const VALID_REFLEX_OPS = new Set<ReflexOp>([
  'lt',
  'lte',
  'gt',
  'gte',
  'eq',
  'neq',
  'contains',
  'in_range',
])
const VALID_ACTION_TYPES = new Set([
  'confirm',
  'follow_up',
  'export',
  'share',
  'dismiss',
  'navigate',
  'external_link',
])

/** Pull a JSON object out of a string that might be wrapped in fences,
 *  preceded by prose, followed by a trailing fenced note, or contain
 *  inner markdown fences inside a `markdown` component's content.
 *
 *  We try three strategies in order and accept the first candidate that
 *  parses as a JSON object:
 *
 *    A. Non-greedy first-fence: ``` … first matching ``` →
 *       picks the FIRST fenced block in the message. Handles the common
 *       case of `prose + ```json …``` + trailing prose or trailing
 *       fenced notes (without over-reaching to the trailing fence).
 *
 *    B. Greedy first-fence: ``` … LAST ``` →
 *       picks everything from the first opener to the last closer.
 *       This is necessary when the artifact itself contains a `markdown`
 *       component whose content has inner ``` fences — Strategy A's
 *       first-close would truncate inside the markdown.
 *
 *    C. Brace scan over the whole text — counts balanced `{...}`
 *       while tracking string boundaries. Last resort when the response
 *       has no fence at all (a raw JSON message). */
export function extractJson(text: string): string | null {
  const trimmed = text.trim()

  for (const candidate of [
    firstFenceCandidate(trimmed),
    greedyFenceCandidate(trimmed),
    braceScan(trimmed),
  ]) {
    if (candidate && isJsonObjectCandidate(candidate)) return candidate
  }

  return null
}

/** Strategy A: ``` … FIRST closing ``` (non-greedy). */
function firstFenceCandidate(text: string): string | null {
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  return m ? m[1].trim() : null
}

/** Strategy B: ``` … LAST closing ``` (greedy). Reaches the outer
 *  closer when the artifact contains inner markdown fences. */
function greedyFenceCandidate(text: string): string | null {
  const m = text.match(/```(?:json)?\s*\n?([\s\S]*)\n?\s*```/)
  return m ? m[1].trim() : null
}

/** Strategy C: balanced-brace scan over the whole text. */
function braceScan(text: string): string | null {
  let depth = 0
  let start = -1
  let inStr = false
  let escape = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }
  return null
}

/** Cheap structural check: starts with `{`, ends with `}`, and
 *  JSON.parses to a non-array object. Used to validate each candidate
 *  so we can fall through to the next strategy on a non-JSON match. */
function isJsonObjectCandidate(candidate: string): boolean {
  if (!candidate.startsWith('{') || !candidate.endsWith('}')) return false
  try {
    const parsed = JSON.parse(candidate)
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    )
  } catch {
    return false
  }
}

export function parseArtifact(rawText: string): ParseResult {
  const trimmed = rawText.trim()
  if (!trimmed) return { ok: false, error: 'agent output was empty' }

  const json = extractJson(trimmed)
  if (!json) return { ok: false, error: 'no JSON object found in agent output' }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    return {
      ok: false,
      error: `JSON parse error: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  return validateDraft(parsed)
}

function validateDraft(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, error: 'top-level value is not an object' }
  }
  const o = input as Record<string, unknown>

  // Header
  if (typeof o.header !== 'object' || o.header === null) {
    return { ok: false, error: 'header is missing or not an object' }
  }
  const h = o.header as Record<string, unknown>
  if (typeof h.label !== 'string' || !h.label.trim()) {
    return { ok: false, error: 'header.label is missing or empty' }
  }
  if (typeof h.title !== 'string' || !h.title.trim()) {
    return { ok: false, error: 'header.title is missing or empty' }
  }
  if (typeof h.timestamp_display !== 'string' || !h.timestamp_display.trim()) {
    return { ok: false, error: 'header.timestamp_display is missing or empty' }
  }
  if (h.summary !== undefined && typeof h.summary !== 'string') {
    return { ok: false, error: 'header.summary, if present, must be a string' }
  }
  if (
    h.label_color !== undefined &&
    !VALID_COLORS.has(h.label_color as ThemeColor)
  ) {
    return {
      ok: false,
      error: `header.label_color "${h.label_color}" is not a valid ThemeColor`,
    }
  }

  // Priority
  const priority = (o.priority ?? 'normal') as Priority
  if (!VALID_PRIORITY.has(priority)) {
    return { ok: false, error: `priority "${priority}" is not valid` }
  }

  const notify = Boolean(o.notify)

  // Components
  if (!Array.isArray(o.components)) {
    return { ok: false, error: 'components must be an array' }
  }
  const components: ArtifactComponent[] = []
  for (let i = 0; i < o.components.length; i++) {
    const c = o.components[i]
    if (typeof c !== 'object' || c === null) {
      return { ok: false, error: `components[${i}] is not an object` }
    }
    const cType = (c as Record<string, unknown>).type
    if (typeof cType !== 'string' || !VALID_COMPONENT_TYPES.has(cType)) {
      return {
        ok: false,
        error: `components[${i}].type "${cType}" is not a known component type`,
      }
    }
    components.push(normalizeComponent(c as Record<string, unknown>))
  }

  // subscribes_to (optional) — for living artifacts
  let subscribes_to: ArtifactSubscription[] | undefined
  if (o.subscribes_to !== undefined) {
    if (!Array.isArray(o.subscribes_to)) {
      return { ok: false, error: 'subscribes_to, if present, must be an array' }
    }
    subscribes_to = []
    for (let i = 0; i < o.subscribes_to.length; i++) {
      const s = o.subscribes_to[i]
      if (typeof s !== 'object' || s === null) {
        return { ok: false, error: `subscribes_to[${i}] is not an object` }
      }
      const so = s as Record<string, unknown>
      // The agent emits source_name (the slug); the persistence layer
      // resolves it to source_id. We pass it through unchanged here.
      const sourceRef =
        typeof so.source_id === 'string'
          ? so.source_id
          : typeof so.source_name === 'string'
            ? so.source_name
            : null
      if (!sourceRef) {
        return {
          ok: false,
          error: `subscribes_to[${i}].source_id or .source_name is required`,
        }
      }
      const conds = so.conditions
      let conditions: ReflexCondition[] | undefined
      if (conds !== undefined) {
        if (!Array.isArray(conds)) {
          return {
            ok: false,
            error: `subscribes_to[${i}].conditions, if present, must be an array`,
          }
        }
        const parsedConds = parseConditions(conds, `subscribes_to[${i}]`)
        if (!parsedConds.ok) return parsedConds
        conditions = parsedConds.conditions
      }
      subscribes_to.push({ source_id: sourceRef, conditions })
    }
  }

  // Actions (optional)
  let actions: ArtifactAction[] | undefined
  if (o.actions !== undefined) {
    if (!Array.isArray(o.actions)) {
      return { ok: false, error: 'actions, if present, must be an array' }
    }
    actions = []
    for (let i = 0; i < o.actions.length; i++) {
      const a = o.actions[i]
      if (typeof a !== 'object' || a === null) {
        return { ok: false, error: `actions[${i}] is not an object` }
      }
      const ao = a as Record<string, unknown>
      if (typeof ao.label !== 'string' || !ao.label.trim()) {
        return { ok: false, error: `actions[${i}].label missing` }
      }
      if (typeof ao.action !== 'string' || !VALID_ACTION_TYPES.has(ao.action)) {
        return {
          ok: false,
          error: `actions[${i}].action "${ao.action}" is not a valid action type`,
        }
      }
      actions.push({
        label: ao.label,
        action: ao.action as ArtifactAction['action'],
        primary: typeof ao.primary === 'boolean' ? ao.primary : undefined,
        prompt: typeof ao.prompt === 'string' ? ao.prompt : undefined,
        target_id:
          typeof ao.target_id === 'string' ? ao.target_id : undefined,
        url: typeof ao.url === 'string' ? ao.url : undefined,
      })
    }
  }

  return {
    ok: true,
    draft: {
      header: {
        label: h.label.trim(),
        title: h.title.trim(),
        summary: typeof h.summary === 'string' ? h.summary.trim() : undefined,
        timestamp_display: h.timestamp_display.trim(),
        label_color: h.label_color as ThemeColor | undefined,
      },
      priority,
      notify,
      components,
      actions,
      subscribes_to,
    },
  }
}

/** Parse a JSON array of conditions into the typed ReflexCondition[].
 *  Exported so route handlers (POST/PATCH on reflexes) can run the same
 *  validation before persistence — otherwise malformed conditions could
 *  reach evaluateConditions on the hot fan-out path and crash a poller. */
export function parseConditions(
  conds: unknown[],
  context: string,
):
  | { ok: true; conditions: ReflexCondition[] }
  | { ok: false; error: string } {
  const out: ReflexCondition[] = []
  for (let i = 0; i < conds.length; i++) {
    const c = conds[i]
    if (typeof c !== 'object' || c === null) {
      return {
        ok: false,
        error: `${context}.conditions[${i}] is not an object`,
      }
    }
    const co = c as Record<string, unknown>
    if (typeof co.path !== 'string' || !co.path.trim()) {
      return {
        ok: false,
        error: `${context}.conditions[${i}].path is missing or empty`,
      }
    }
    if (typeof co.op !== 'string' || !VALID_REFLEX_OPS.has(co.op as ReflexOp)) {
      return {
        ok: false,
        error: `${context}.conditions[${i}].op "${co.op}" is not a valid op`,
      }
    }
    // `value` must be present; type-checked loosely against op.
    if (co.value === undefined || co.value === null) {
      return {
        ok: false,
        error: `${context}.conditions[${i}].value is required`,
      }
    }
    if (co.op === 'in_range') {
      if (
        !Array.isArray(co.value) ||
        co.value.length !== 2 ||
        typeof co.value[0] !== 'number' ||
        typeof co.value[1] !== 'number'
      ) {
        return {
          ok: false,
          error: `${context}.conditions[${i}].value must be [min, max] for in_range`,
        }
      }
    } else if (
      typeof co.value !== 'string' &&
      typeof co.value !== 'number' &&
      typeof co.value !== 'boolean'
    ) {
      return {
        ok: false,
        error: `${context}.conditions[${i}].value must be string | number | [min, max]`,
      }
    }
    out.push({
      path: co.path.trim(),
      op: co.op as ReflexOp,
      value: co.value as ReflexCondition['value'],
    })
  }
  return { ok: true, conditions: out }
}

/**
 * Component-level normalization. We accept what the agent produces with
 * minimal coercion — just clamp obvious type mismatches (e.g. trend tokens)
 * so render-time crashes are rare.
 */
function normalizeComponent(c: Record<string, unknown>): ArtifactComponent {
  // For data_row, normalize trend tokens.
  if (c.type === 'data_row' && Array.isArray(c.cells)) {
    c.cells = c.cells.map((cell: unknown) => {
      if (typeof cell !== 'object' || cell === null) return cell
      const ce = cell as Record<string, unknown>
      if (ce.trend && !VALID_TRENDS.has(ce.trend as Trend)) {
        // Drop unknown trend tokens rather than rendering garbage.
        delete ce.trend
      }
      return ce
    })
  }
  // For reflex_proposal, coerce numeric strings in conditions and drop
  // any condition we can't parse cleanly. The renderer is forgiving.
  if (c.type === 'reflex_proposal' && Array.isArray(c.conditions)) {
    const parsed = parseConditions(c.conditions, 'reflex_proposal')
    c.conditions = parsed.ok ? parsed.conditions : []
  }

  normalizeVocabularyV2Component(c)
  return c as unknown as ArtifactComponent
}

function normalizeVocabularyV2Component(c: Record<string, unknown>): void {
  switch (c.type) {
    case 'calculation':
      normalizeArray(c, 'steps')
      break
    case 'what_if':
      normalizeArray(c, 'inputs')
      normalizeArray(c, 'outputs')
      break
    case 'assumption_list':
      normalizeArray(c, 'items')
      break
    case 'counter_proposal':
      normalizeArray(c, 'segments')
      break
    case 'tradeoff_slider':
      normalizeNumber(c, 'value', 50)
      normalizeNumber(c, 'min', 0)
      normalizeNumber(c, 'max', 100)
      break
    case 'trigger_proposal':
      // The renderer spreads `alternatives` into an array literal; a
      // single object (a common model schema drift) would throw
      // `TypeError: ... is not iterable`. Coerce to [].
      if (c.alternatives !== undefined && !Array.isArray(c.alternatives)) {
        c.alternatives = []
      }
      break
    case 'draft_review':
      normalizeArray(c, 'uncertain_spans')
      break
    case 'plan_card':
      normalizeArray(c, 'steps')
      break
    case 'decision_tree':
      normalizeArray(c, 'branches')
      break
    case 'checkpoint':
      normalizeArray(c, 'stages')
      break
    case 'schedule_picker':
      normalizeArray(c, 'slots')
      break
    case 'calendar_view':
      normalizeArray(c, 'days')
      break
    case 'heatmap':
      normalizeArray(c, 'values')
      break
    case 'annotated_text':
      normalizeArray(c, 'annotations')
      break
    case 'transcript':
      normalizeArray(c, 'lines')
      break
    case 'annotated_image':
      normalizeArray(c, 'pins')
      break
    case 'session_brief':
      normalizeArray(c, 'facts')
      normalizeArray(c, 'open_threads')
      break
    case 'agent_tasks':
      normalizeArray(c, 'tasks')
      break
    case 'deferred_list':
      normalizeArray(c, 'items')
      break
    case 'decision_matrix':
      normalizeArray(c, 'options')
      normalizeArray(c, 'criteria')
      break
    case 'pros_cons':
      normalizeArray(c, 'pros')
      normalizeArray(c, 'cons')
      break
    case 'ranking':
      normalizeArray(c, 'items')
      break
    case 'timer':
      normalizeNumber(c, 'duration_seconds', 0)
      normalizeNumber(c, 'elapsed_seconds', 0)
      break
    case 'counter':
      normalizeNumber(c, 'value', 0)
      break
    case 'network':
      normalizeArray(c, 'nodes')
      normalizeArray(c, 'edges')
      break
    case 'tree':
      normalizeArray(c, 'nodes')
      break
    case 'sankey':
      normalizeArray(c, 'nodes')
      normalizeArray(c, 'flows')
      break
  }
}

function normalizeArray(c: Record<string, unknown>, key: string): void {
  if (!Array.isArray(c[key])) c[key] = []
}

function normalizeNumber(
  c: Record<string, unknown>,
  key: string,
  fallback: number,
): void {
  const value = c[key]
  if (typeof value !== 'number' || Number.isNaN(value)) {
    c[key] = fallback
  }
}
