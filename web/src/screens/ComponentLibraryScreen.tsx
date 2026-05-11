// "What the agent can render" — every artifact component type with a
// sample. Feeds the live ArtifactRenderer so we never drift between
// docs and reality.

import type { JSX } from 'react'

import type { ArtifactComponent } from '@shared/index'
import { ArtifactComponentView } from '../components/artifact/ArtifactRenderer'
import { ScreenHead } from '../components/shell/Shell'
import { useAppStore } from '../store/useAppStore'

interface Sample {
  kind: string
  title: string
  desc: string
  component: ArtifactComponent
}

const SAMPLES: Sample[] = [
  {
    kind: 'data_row',
    title: 'Data row',
    desc: '2–5 labeled metrics in a horizontal strip. Use for at-a-glance numbers.',
    component: {
      type: 'data_row',
      cells: [
        { value: '1.38', label: 'AC ratio', color: 'signal', trend: 'up' },
        { value: '847', label: 'Week TSS' },
        { value: '52', label: 'Rest HR', color: 'cool', trend: 'down' },
      ],
    },
  },
  {
    kind: 'paragraph',
    title: 'Paragraph',
    desc: 'Body text. Keep under 3 sentences.',
    component: {
      type: 'paragraph',
      text: 'Your training load is elevated. Acute load up 18% week-over-week, resting HR 4 bpm above baseline. Race target intact if Thursday goes recovery.',
    },
  },
  {
    kind: 'heading',
    title: 'Heading',
    desc: 'Section heading inside an artifact.',
    component: { type: 'heading', text: 'Recommendations', level: 3 },
  },
  {
    kind: 'sparkline',
    title: 'Sparkline',
    desc: 'Vertical bars over a 5–14 value time series. Thresholds flag attention.',
    component: {
      type: 'sparkline',
      values: [45, 62, 18, 68, 78, 95, 42],
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      thresholds: [{ above: 75, color: 'signal' }],
      base_color: 'cool',
    },
  },
  {
    kind: 'line_chart',
    title: 'Line chart',
    desc: 'Multi-series trend over time. Better than sparkline for comparisons.',
    component: {
      type: 'line_chart',
      x_labels: ['Mon', 'Tue', 'Wed', 'Thu'],
      series: [
        { name: 'This week', values: [120, 135, 128, 142], color: 'signal' },
        { name: 'Last week', values: [110, 118, 125, 130], color: 'cool' },
      ],
    },
  },
  {
    kind: 'bar_chart',
    title: 'Bar chart',
    desc: 'Stacked horizontal bars. Useful for breakdowns.',
    component: {
      type: 'bar_chart',
      groups: [
        {
          label: 'Mon',
          values: [
            { name: 'Z2', value: 40, color: 'cool' },
            { name: 'Tempo', value: 18, color: 'signal' },
          ],
        },
        {
          label: 'Wed',
          values: [
            { name: 'Z2', value: 35, color: 'cool' },
            { name: 'Tempo', value: 12, color: 'signal' },
          ],
        },
      ],
    },
  },
  {
    kind: 'table',
    title: 'Table',
    desc: 'Tabular data, ≤8 rows.',
    component: {
      type: 'table',
      headers: ['Metric', 'This week', 'Trend'],
      rows: [
        { cells: ['Total TSS', '847', '↑ 23%'], colors: { 2: 'amber' } },
        { cells: ['AC ratio', '1.38', 'high'], colors: { 2: 'signal' } },
        { cells: ['Rest HR', '52', '↑ 4 bpm'], colors: { 2: 'amber' } },
      ],
    },
  },
  {
    kind: 'quote',
    title: 'Quote',
    desc: 'A pulled passage or recommendation.',
    component: {
      type: 'quote',
      text: 'Replace Thursday’s intervals with 45min Z2 recovery.',
      attribution: 'Agent recommendation',
    },
  },
  {
    kind: 'alert',
    title: 'Alert',
    desc: 'Severity-coded callout. info / warning / critical.',
    component: {
      type: 'alert',
      severity: 'warning',
      title: 'Overtraining risk',
      text: 'AC ratio exceeds safe threshold. Reduce intensity this week.',
    },
  },
  {
    kind: 'timeline',
    title: 'Timeline',
    desc: 'Phases of work shown as a horizontal track.',
    component: {
      type: 'timeline',
      segments: [
        { label: 'Mon', duration: 1, status: 'complete', color: 'cool' },
        { label: 'Tue', duration: 1, status: 'complete', color: 'cool' },
        { label: 'Wed', duration: 1, status: 'active', color: 'signal' },
        { label: 'Thu', duration: 1, status: 'pending' },
        { label: 'Fri', duration: 1, status: 'blocked', color: 'amber' },
      ],
    },
  },
  {
    kind: 'progress',
    title: 'Progress (bar)',
    desc: 'Parallel progress tracks. ring or bar display.',
    component: {
      type: 'progress',
      display: 'bar',
      items: [
        { label: 'Reviewed', value: 74, max: 100, color: 'cool' },
        { label: 'Cited', value: 49, max: 100, color: 'green' },
        { label: 'Drafted', value: 22, max: 100, color: 'signal' },
      ],
    },
  },
  {
    kind: 'progress-ring',
    title: 'Progress (ring)',
    desc: 'Same data, ring display.',
    component: {
      type: 'progress',
      display: 'ring',
      items: [
        { label: 'Reviewed', value: 74, max: 100, color: 'cool' },
        { label: 'Cited', value: 49, max: 100, color: 'green' },
      ],
    },
  },
  {
    kind: 'sources',
    title: 'Sources',
    desc: 'Provenance chips — always include when synthesizing 2+ inputs.',
    component: {
      type: 'sources',
      items: ['garmin', 'whoop', 'sleep cycle'],
    },
  },
  {
    kind: 'status_list',
    title: 'Status list',
    desc: 'Compact rows for secondary metrics.',
    component: {
      type: 'status_list',
      items: [
        { icon: '🦶', label: 'Shoe mileage', value: '312 mi', color: 'signal' },
        { icon: '💤', label: 'Sleep trend', value: '7h 12m avg' },
        { icon: '🌧', label: 'Saturday forecast', value: '58°F · clear', color: 'cool' },
      ],
    },
  },
  {
    kind: 'image',
    title: 'Image',
    desc: 'Rendered image with optional caption.',
    component: {
      type: 'image',
      url: '',
      caption: 'Site photo — north wall',
      aspect: '16:9',
    },
  },
  {
    kind: 'html_embed',
    title: 'HTML embed',
    desc: 'Sandboxed iframe for cases the standard library can’t express. Use sparingly.',
    component: {
      type: 'html_embed',
      content: '<div style="font-family:sans-serif;padding:20px;color:#5CB8B2">embedded</div>',
      height: 80,
    },
  },
  {
    kind: 'checklist',
    title: 'Checklist',
    desc: 'Interactive task list. Items can trigger follow-ups.',
    component: {
      type: 'checklist',
      items: [
        { id: 'c1', text: 'Verify electrical panel capacity', checked: true },
        { id: 'c2', text: 'Request updated quote from Apex', checked: false },
        { id: 'c3', text: 'Confirm subcontractor schedule', checked: false },
      ],
    },
  },
  {
    kind: 'comparison',
    title: 'Comparison',
    desc: 'Side-by-side options. Highlight the recommended one.',
    component: {
      type: 'comparison',
      items: [
        {
          name: 'Apex',
          metrics: { Total: '$58k', Days: '32', HVAC: 'incl' },
          color: 'amber',
        },
        {
          name: 'Greenfield',
          metrics: { Total: '$48k', Days: '28', HVAC: 'incl' },
          highlight: true,
        },
        {
          name: 'Birch',
          metrics: { Total: '$42k', Days: '26', HVAC: 'missing' },
          color: 'red',
        },
      ],
    },
  },
  {
    kind: 'divider',
    title: 'Divider',
    desc: 'Visual separator.',
    component: { type: 'divider' },
  },
  {
    kind: 'map',
    title: 'Map',
    desc: 'Location with markers. Stylized to fit the theme.',
    component: {
      type: 'map',
      center: { lat: 39.21, lng: -76.77 },
      markers: [
        { lat: 39.21, lng: -76.77, label: 'Job site', color: 'signal' },
      ],
    },
  },
  {
    kind: 'question_set',
    title: 'Question set',
    desc: 'Typed inputs the user can answer inline. The agent uses this when it needs values, not just confirmations.',
    component: {
      type: 'question_set',
      questions: [
        {
          id: 'sleep',
          label: "Last night's sleep — total hours and how rested you felt (1–10)",
          placeholder: '6h 20m, 5/10 — woke twice',
        },
        {
          id: 'nutrition',
          label: "Today's nutrition — calories, carbs, hydration, last meal timing",
          multiline: true,
        },
      ],
    },
  },
  {
    kind: 'markdown',
    title: 'Markdown',
    desc: 'Rich-text prose with formatting. Use when `paragraph` is too plain.',
    component: {
      type: 'markdown',
      content:
        'Two patterns explain heavy legs on an evening run:\n\n1. **Cumulative load** — last 5–7 days totalled more than your body absorbed.\n2. **Same-day deficit** — under-fueled, dehydrated, or short on sleep.\n\n> The four data points below separate them.',
    },
  },
  {
    kind: 'key_value_list',
    title: 'Key / value list',
    desc: 'Compact rows of named fields. Lighter than `table`, denser than `data_row`.',
    component: {
      type: 'key_value_list',
      items: [
        { key: 'Distance', value: '7.2 mi' },
        { key: 'Avg pace', value: '9:05 / mi', color: 'amber' },
        { key: 'Avg HR', value: '162 bpm' },
        { key: 'Time of day', value: 'PM' },
      ],
    },
  },
  {
    kind: 'link_preview',
    title: 'Link preview',
    desc: 'Styled card for a cited URL. Pair with text — not a standalone artifact.',
    component: {
      type: 'link_preview',
      url: 'https://www.runnersworld.com/training/a20846211/the-truth-about-tapering',
      title: 'The truth about tapering',
      description:
        'How to dial back training in the final weeks before a goal race.',
      domain: 'runnersworld.com',
    },
  },
]

export function ComponentLibraryScreen(): JSX.Element {
  const back = useAppStore((s) => s.back)

  return (
    <div
      className="screen enter"
      data-screen-label="Component library"
      style={{ paddingBottom: 120 }}
    >
      <ScreenHead onBack={back} title="Component library" />
      <div
        style={{ padding: 'var(--space-sm) var(--screen-pad) var(--space-md)' }}
        className="rise"
      >
        <div className="t-tag" style={{ color: 'var(--signal)', marginBottom: 6 }}>
          {SAMPLES.length} components
        </div>
        <h1
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 32,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            fontWeight: 400,
            marginBottom: 8,
          }}
        >
          What the agent <em>can render</em>
        </h1>
        <p className="t-body-sm">
          The agent picks from these and arranges them around your
          context. The samples below are static — yours will reflect
          what you've sent.
        </p>
      </div>

      <div
        style={{
          padding: '0 var(--screen-pad)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {SAMPLES.map((s, i) => (
          <div key={s.kind} className="card rise" style={{ padding: 16 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 12,
              }}
            >
              <div>
                <div className="t-tag" style={{ color: 'var(--text-3)', marginBottom: 4 }}>
                  <span className="t-mono" style={{ color: 'var(--signal)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>{' '}
                  · {s.kind}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 17,
                    fontWeight: 400,
                    letterSpacing: '-0.005em',
                  }}
                >
                  {s.title}
                </div>
                <div className="t-caption" style={{ marginTop: 2 }}>
                  {s.desc}
                </div>
              </div>
            </div>
            <div className="hr" style={{ margin: '4px -2px 14px' }} />
            <ArtifactComponentView component={s.component} />
          </div>
        ))}
      </div>
    </div>
  )
}
