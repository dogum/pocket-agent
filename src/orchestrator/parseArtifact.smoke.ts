// =====================================================================
// parseArtifact smoke test — invariants the parser must keep.
//
// Scenarios, each one a regression risk:
//   1. A real captured v1 artifact (training-load shape) with an inner
//      ```fence``` inside a `markdown` component. The parser must
//      extract the OUTER artifact JSON, not the inner fence.
//   2. A v2 artifact that uses `calculation` + `assumption_list` +
//      `confidence_band` together — the three components the agent
//      previously emitted "in protest". They must parse cleanly and
//      retain their fields.
//   3. The full v2 inventory must parse, including compatibility aliases.
//   4. An unknown component type must still reject.
//
// Run via `pnpm smoke:parser` (see package.json) or directly via tsx.
// =====================================================================

import assert from 'node:assert/strict'

import { parseArtifact } from './parseArtifact.js'

// ── 1. Captured v1 artifact with inner markdown fence ───────────────
const capturedTrainingLoadArtifact = JSON.stringify({
  header: {
    label: 'ANALYSIS',
    title: 'Mileage increase risk check',
    summary: '42 miles vs 31 last week is a 35.5% jump, which is above the usual caution band.',
    timestamp_display: 'Just now',
    label_color: 'amber',
  },
  priority: 'normal',
  notify: false,
  components: [
    {
      type: 'data_row',
      cells: [
        { value: '42 mi', label: 'This week', color: 'signal', trend: 'up' },
        { value: '31 mi', label: 'Last week' },
        { value: '+35.5%', label: 'Increase', color: 'amber', trend: 'warn' },
      ],
    },
    { type: 'heading', text: 'Math', level: 3 },
    {
      type: 'markdown',
      content:
        'Risk calculation:\n\n```\nΔ% = (42 - 31) / 31 × 100\nΔ% = 11 / 31 × 100\nΔ% = 35.5%\n```\n\nThat is above a conservative 10-20% weekly increase guideline.',
    },
    {
      type: 'table',
      headers: ['Step', 'Value'],
      rows: [
        { cells: ['Difference', '11 miles'] },
        { cells: ['Percent increase', '35.5%'], colors: { 1: 'amber' } },
      ],
    },
    {
      type: 'key_value_list',
      items: [
        { key: 'Risk read', value: 'Elevated', color: 'amber' },
        { key: 'Confidence', value: 'Medium' },
      ],
    },
    {
      type: 'alert',
      severity: 'warning',
      title: 'Mileage jump is aggressive',
      text: 'The increase is likely risky unless last week was unusually low or this week was mostly easy.',
    },
    {
      type: 'question_set',
      questions: [
        {
          id: 'intensity',
          label: 'How many of the 42 miles were hard workouts or long-run miles?',
          multiline: true,
        },
      ],
    },
    { type: 'sources', items: ['user prompt'] },
  ],
  actions: [
    {
      label: 'Adjust for intensity',
      action: 'follow_up',
      primary: true,
      prompt: 'Recalculate risk using workout intensity and long-run distance.',
    },
    { label: 'Share', action: 'share' },
  ],
})

const parsed = parseArtifact(capturedTrainingLoadArtifact)
assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.error)
if (parsed.ok) {
  assert.equal(parsed.draft.header.label, 'ANALYSIS')
  assert.equal(parsed.draft.components.length, 8)
  assert.equal(parsed.draft.components[2].type, 'markdown')
}

// ── 2. v2 thinking artifact: calculation + assumption_list + confidence_band ──
// This is the exact failure pattern from May 13: the agent emitted these
// three types but treated them as "proposed shapes" because the prompt
// framed them as a separate vocabulary. The parser is in fact happy with
// them — the contract is intact end-to-end.
const v2ThinkingArtifact = JSON.stringify({
  header: {
    label: 'ANALYSIS',
    title: 'Mileage increase risk — with the math, premises, and confidence',
    summary: 'A 35.5% jump sits above the conservative 10–20% band.',
    timestamp_display: 'Just now',
    label_color: 'amber',
  },
  priority: 'normal',
  notify: false,
  components: [
    {
      type: 'calculation',
      label: 'Weekly mileage increase',
      steps: [
        { id: 'delta', label: 'Mileage difference', expression: '42 − 31', value: '11 mi' },
        {
          id: 'pct',
          label: 'Percent increase',
          expression: '11 / 31 × 100',
          value: '35.5%',
          emphasis: true,
        },
      ],
      result: {
        label: 'Risk band',
        value: 'above a conservative 10–20% increase',
        color: 'amber',
      },
    },
    {
      type: 'assumption_list',
      items: [
        {
          id: 'baseline',
          text: "Last week's 31 miles was a normal week, not a planned deload.",
          confidence: 'medium',
          correction_prompt: 'Was last week unusually low?',
        },
        {
          id: 'intensity',
          text: 'The 42 miles were not mostly hard workouts.',
          confidence: 'low',
          correction_prompt: 'How many miles were hard or long-run miles?',
        },
      ],
    },
    {
      type: 'confidence_band',
      label: 'Risk confidence',
      value: '68',
      unit: '%',
      low: 52,
      mid: 68,
      high: 82,
      method: 'Medium — intensity and soreness history are unknown.',
      color: 'amber',
    },
    { type: 'sources', items: ['user prompt'] },
  ],
})

const v2 = parseArtifact(v2ThinkingArtifact)
assert.equal(v2.ok, true, v2.ok ? undefined : v2.error)
if (v2.ok) {
  const types = v2.draft.components.map((c) => c.type)
  assert.deepEqual(
    types,
    ['calculation', 'assumption_list', 'confidence_band', 'sources'],
    `expected v2 thinking trio to parse; got ${types.join(', ')}`,
  )
  const calc = v2.draft.components[0]
  assert.equal(calc.type, 'calculation')
  if (calc.type === 'calculation') {
    assert.equal(calc.steps.length, 2)
    assert.equal(calc.result?.value, 'above a conservative 10–20% increase')
  }
  const cb = v2.draft.components[2]
  assert.equal(cb.type, 'confidence_band')
  if (cb.type === 'confidence_band') {
    assert.equal(cb.mid, 68)
    assert.equal(cb.high, 82)
  }
}

// ── 3. Full Vocabulary v2 inventory parses and normalizes aliases ───
const allV2TypesArtifact = JSON.stringify({
  header: {
    label: 'REFERENCE',
    title: 'All Vocabulary v2 component types',
    timestamp_display: 'Just now',
  },
  priority: 'normal',
  notify: false,
  components: [
    {
      type: 'calculation',
      label: 'Delta',
      steps: [{ id: 's1', label: 'A minus B', expression: '42 - 31', value: '11', unit: 'mi' }],
      result: { label: 'Difference', value: '11', unit: 'mi' },
    },
    {
      type: 'what_if',
      label: 'Mileage scenario',
      inputs: [{ id: 'miles', label: 'Miles', kind: 'slider', value: 36, min: 20, max: 50 }],
      outputs: [{ id: 'risk', label: 'Risk', value: 'medium' }],
      scenarios: [
        { input_values: { miles: 36 }, outputs: [{ id: 'risk', label: 'Risk', value: 'medium' }] },
      ],
    },
    { type: 'assumption_list', items: [{ id: 'a1', text: 'Baseline week was normal.', confidence: 'medium' }] },
    { type: 'confidence_band', label: 'Confidence', value: '68', unit: '%', low: 52, mid: 68, high: 82 },
    {
      type: 'counter_proposal',
      segments: [
        { id: 'seg1', label: 'Mileage', proposal: 'Cut to 36.', default: 'accept' },
        { id: 'seg2', label: 'Intensity', proposal: 'One workout.', default: 'modify', modify_placeholder: 'Alternative?' },
      ],
    },
    {
      type: 'tradeoff_slider',
      question: 'Recovery vs fitness?',
      left: { label: 'Recovery' },
      right: { label: 'Fitness' },
      value: 35,
    },
    { type: 'draft_review', title: 'Note', body: 'Keep this unless sleep drops.', uncertain_spans: [{ id: 'u1', text: 'unless sleep drops' }] },
    {
      type: 'plan_card',
      goal: 'Recover safely',
      steps: [
        { id: 'p1', title: 'Easy run', state: 'doing' },
        {
          id: 'p2',
          title: 'Pick window',
          state: 'pending',
          ask: { id: 'window', label: 'Window?', kind: 'choice', options: ['AM', 'PM'] },
          on_done: { type: 'follow_up', prompt: 'Step done.' },
        },
      ],
    },
    { type: 'decision_tree', question: 'Sore?', branches: [{ id: 'yes', choice: 'Yes', conclusion: 'Rest.' }] },
    { type: 'checkpoint', stages: [{ id: 'c1', label: 'Detect', state: 'done' }] },
    { type: 'schedule_picker', slots: [{ id: 'slot', date_label: 'Tomorrow', time_range: '7-8 AM' }] },
    { type: 'calendar_view', days: [{ id: 'mon', name: 'Mon', number: '1', events: [{ id: 'e1', label: 'Easy', state: 'planned' }] }] },
    { type: 'heatmap', values: [{ date: '2026-05-13', value: 2 }] },
    { type: 'trigger_proposal', cadence_label: 'Every Sunday', cron: '0 7 * * 0', action: 'Review load.', alternatives: { label: 'Bad shape', cron: '0 8 * * 1' } },
    { type: 'annotated_text', content: '42 miles vs 31 last week.', annotations: [{ id: 'ann', text: '42 miles', note: 'Current week' }] },
    { type: 'diff', before: '42 again', after: '36 easy' },
    { type: 'transcript', lines: [{ id: 'l1', time: '00:01', text: 'Heel hurt.', pinned: true }] },
    { type: 'annotated_image', markers: [{ id: 'pin', x: 0.2, y: 0.3, label: 'Heel point' }] },
    { type: 'session_brief', facts: [{ key: 'Goal', value: 'Stay healthy', confidence: 'high' }] },
    { type: 'agent_tasks', tasks: [{ id: 'task', label: 'Watch mileage', state: 'scheduled' }] },
    { type: 'deferred_list', items: [{ text: 'Shoe mileage', reason: 'Not load-bearing yet.' }] },
    { type: 'decision_matrix', options: ['A', 'B'], criteria: [{ id: 'risk', label: 'Risk', weight: 1, scores: { A: 3, B: 8 } }] },
    { type: 'pros_cons', pros: [{ text: 'Safer' }], cons: [{ text: 'Less specific' }] },
    { type: 'ranking', items: [{ id: 'r1', label: 'Health' }, { id: 'r2', label: 'Speed' }] },
    { type: 'timer', id: 'timer', label: 'Mobility', duration_seconds: 60 },
    { type: 'counter', id: 'counter', label: 'Strides', value: 0, target: 6, step: 1 },
    { type: 'scratchpad', id: 'pad', content: 'Notes', placeholder: 'Write notes...' },
    {
      type: 'network',
      nodes: [{ id: 'load', label: 'Load', x: 0.2, y: 0.5 }, { id: 'risk', label: 'Risk', x: 0.8, y: 0.5 }],
      edges: [{ source: 'load', target: 'risk', label: 'raises' }],
    },
    { type: 'tree', nodes: [{ id: 'root', label: 'Risk' }, { id: 'volume', parent_id: 'root', label: 'Volume' }] },
    {
      type: 'sankey',
      nodes: [{ id: 'week', label: 'Week' }, { id: 'easy', label: 'Easy' }],
      flows: [{ source: 'week', target: 'easy', value: 34, label: 'mi' }],
    },
  ],
})

const allV2 = parseArtifact(allV2TypesArtifact)
assert.equal(allV2.ok, true, allV2.ok ? undefined : allV2.error)
if (allV2.ok) {
  assert.equal(allV2.draft.components.length, 30)
  const trigger = allV2.draft.components.find((c) => c.type === 'trigger_proposal')
  assert.equal(trigger?.type, 'trigger_proposal')
  if (trigger?.type === 'trigger_proposal') {
    assert.deepEqual(trigger.alternatives, [])
  }
  const image = allV2.draft.components.find((c) => c.type === 'annotated_image')
  assert.equal(image?.type, 'annotated_image')
  if (image?.type === 'annotated_image') {
    assert.equal(image.pins?.[0]?.label, 'Heel point')
  }
  const network = allV2.draft.components.find((c) => c.type === 'network')
  assert.equal(network?.type, 'network')
  if (network?.type === 'network') {
    assert.equal(network.edges[0].from, 'load')
    assert.equal(network.edges[0].to, 'risk')
  }
  const sankey = allV2.draft.components.find((c) => c.type === 'sankey')
  assert.equal(sankey?.type, 'sankey')
  if (sankey?.type === 'sankey') {
    assert.equal(sankey.flows[0].from, 'week')
    assert.equal(sankey.flows[0].to, 'easy')
  }
}

// ── 3b. Multi-fence response — fenced artifact PLUS a trailing
//        fenced note (Codex PR #10 follow-up). The greedy fence
//        regex would span from the first opener to the LAST closer,
//        producing a non-JSON candidate and falling to brace-scan,
//        which would then trip on a leading `{draft}` in prose. The
//        strategy-A first-fence path must catch the artifact cleanly.
const multiFenceWithTrailingNote = `Here is the {draft} you asked for:

\`\`\`json
${JSON.stringify({
  header: {
    label: 'NOTE',
    title: 'Multi-fence response with trailing note',
    timestamp_display: 'Just now',
  },
  priority: 'normal',
  notify: false,
  components: [{ type: 'paragraph', text: 'Artifact body.' }],
})}
\`\`\`

A passing note for the reviewer:

\`\`\`
random fenced content that should not be picked up
\`\`\`
`

const multiFence = parseArtifact(multiFenceWithTrailingNote)
assert.equal(
  multiFence.ok,
  true,
  multiFence.ok
    ? undefined
    : `multi-fence with trailing note should parse to the FIRST fenced artifact, got: ${multiFence.error}`,
)
if (multiFence.ok) {
  assert.equal(multiFence.draft.header.title, 'Multi-fence response with trailing note')
  assert.equal(multiFence.draft.components.length, 1)
}

// ── 3. Prose-wrapped fenced artifact (Codex PR #10 regression) ──────
// A leading {draft}-shaped brace in prose must NOT win over the real
// fenced JSON that follows. The fence-aware extractor catches this
// before the brace-scan fallback can latch onto the wrong segment.
const proseWrappedFenced = `Here's the {draft} artifact you asked for:

\`\`\`json
${JSON.stringify({
  header: {
    label: 'NOTE',
    title: 'Wrapped in prose with a stray brace',
    timestamp_display: 'Just now',
  },
  priority: 'normal',
  notify: false,
  components: [{ type: 'paragraph', text: 'Hello.' }],
})}
\`\`\`

Hope that's useful!`

const wrapped = parseArtifact(proseWrappedFenced)
assert.equal(
  wrapped.ok,
  true,
  wrapped.ok
    ? undefined
    : `prose-wrapped fenced artifact should parse, got: ${wrapped.error}`,
)
if (wrapped.ok) {
  assert.equal(wrapped.draft.header.label, 'NOTE')
  assert.equal(wrapped.draft.components.length, 1)
  assert.equal(wrapped.draft.components[0].type, 'paragraph')
}

// ── 4. Unknown component types still reject ─────────────────────────
const unknown = parseArtifact(
  JSON.stringify({
    header: {
      label: 'TEST',
      title: 'Unknown component rejection',
      timestamp_display: 'Just now',
    },
    priority: 'normal',
    notify: false,
    components: [{ type: 'not_a_component' }],
  }),
)
assert.equal(unknown.ok, false, 'unknown component type should be rejected')

console.log(
  'parser smoke passed:',
  '\n  ✓ captured v1 artifact with inner markdown fence parses',
  '\n  ✓ v2 thinking trio (calculation + assumption_list + confidence_band) parses with fields intact',
  '\n  ✓ all 30 Vocabulary v2 component types parse, with alias normalizers intact',
  '\n  ✓ prose-wrapped fenced artifact with stray {brace} in prose still parses',
  '\n  ✓ multi-fence response (artifact + trailing fenced note) picks the FIRST fenced artifact',
  '\n  ✓ unknown component types still reject',
)
