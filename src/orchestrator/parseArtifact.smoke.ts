// =====================================================================
// parseArtifact smoke test — invariants the parser must keep.
//
// Three scenarios, each one a regression risk:
//   1. A real captured v1 artifact (training-load shape) with an inner
//      ```fence``` inside a `markdown` component. The parser must
//      extract the OUTER artifact JSON, not the inner fence.
//   2. A v2 artifact that uses `calculation` + `assumption_list` +
//      `confidence_band` together — the three components the agent
//      previously emitted "in protest". They must parse cleanly and
//      retain their fields.
//   3. An unknown component type must still reject.
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

// ── 3. Unknown component types still reject ─────────────────────────
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
  '\n  ✓ unknown component types still reject',
)
