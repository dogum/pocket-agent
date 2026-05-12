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
 *  preceded by prose, or followed by a trailing comment. We match the
 *  outermost {...} by counting braces, ignoring braces inside strings.  */
export function extractJson(text: string): string | null {
  // Strip leading code fences quickly.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (fenced) return fenced[1].trim()

  // Otherwise scan for a balanced top-level object.
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
  return c as unknown as ArtifactComponent
}
