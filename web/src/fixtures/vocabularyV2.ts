import type { Artifact } from '@shared/index'

const now = '2026-05-12T12:00:00.000Z'
const sessionId = 'fixture-vocabulary-v2'

export const vocabularyV2Artifacts = [
  {
    id: 'vocab-v2-thinking',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'ANALYSIS',
      title: 'Training load audit',
      summary: 'The agent shows the math, assumptions, and uncertainty behind a recommendation.',
      timestamp_display: 'Fixture',
      label_color: 'cool',
    },
    components: [
      {
        type: 'calculation',
        label: 'Acute chronic load',
        steps: [
          {
            id: 'acute',
            label: 'Acute 7 day load',
            expression: '112 + 128 + 94 + 145 + 86 + 132 + 150',
            value: '847 TSS',
          },
          {
            id: 'chronic',
            label: 'Chronic 28 day average',
            expression: '24 day rolling load / 4',
            value: '614 TSS',
          },
          {
            id: 'ratio',
            label: 'Acute / chronic ratio',
            expression: '847 / 614',
            value: '1.38',
            emphasis: true,
          },
        ],
        result: { label: 'Risk threshold', value: 'above 1.30', color: 'amber' },
      },
      {
        type: 'what_if',
        label: 'If Thursday changes',
        inputs: [
          {
            id: 'thursday',
            label: 'Thursday session',
            kind: 'choice',
            value: '45 min Z2',
            choices: ['Intervals', '45 min Z2', 'Rest'],
          },
          {
            id: 'saturday',
            label: 'Saturday duration',
            kind: 'slider',
            value: 90,
            min: 45,
            max: 120,
            step: 15,
            unit: 'minutes',
          },
        ],
        outputs: [
          { id: 'ratio', label: 'Projected AC ratio', value: '1.24', color: 'green' },
          { id: 'race', label: 'Race target impact', value: 'Low' },
        ],
        scenarios: [
          {
            input_values: { thursday: '45 min Z2', saturday: 90 },
            outputs: [
              { id: 'ratio', label: 'Projected AC ratio', value: '1.24', color: 'green' },
              { id: 'race', label: 'Race target impact', value: 'Low' },
            ],
          },
          {
            input_values: { thursday: 'Intervals', saturday: 120 },
            outputs: [
              { id: 'ratio', label: 'Projected AC ratio', value: '1.42', color: 'red' },
              { id: 'race', label: 'Race target impact', value: 'High risk' },
            ],
          },
          {
            input_values: { thursday: 'Rest', saturday: 60 },
            outputs: [
              { id: 'ratio', label: 'Projected AC ratio', value: '1.15', color: 'green' },
              { id: 'race', label: 'Race target impact', value: 'Very low' },
            ],
          },
        ],
      },
      {
        type: 'assumption_list',
        items: [
          {
            id: 'race',
            text: 'May 31 remains the target race date.',
            confidence: 'high',
            correction_prompt: 'What date should the agent use instead?',
          },
          {
            id: 'sleep',
            text: 'Poor sleep is temporary, not an illness signal.',
            confidence: 'medium',
            correction_prompt: 'Correct the recovery context.',
          },
        ],
      },
      {
        type: 'confidence_band',
        label: 'Finish readiness',
        value: '74',
        unit: '%',
        low: 61,
        mid: 74,
        high: 86,
        method: 'range from recent load and sleep',
        color: 'cool',
      },
    ],
  },
  {
    id: 'vocab-v2-negotiation',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'PROPOSAL',
      title: 'Counter-offer for this week',
      summary: 'A multi-part proposal the user can tune instead of accepting whole.',
      timestamp_display: 'Fixture',
      label_color: 'signal',
    },
    components: [
      {
        type: 'tradeoff_slider',
        question: 'How much should this plan favor recovery over race specificity?',
        left: { label: 'Protect recovery', description: 'lower risk, fewer hard efforts' },
        right: { label: 'Protect specificity', description: 'more race-pace stimulus' },
        value: 35,
        note: 'The current recommendation leans recovery because the load ratio is high.',
      },
      {
        type: 'counter_proposal',
        intro: 'Accept, modify, or reject each training change.',
        segments: [
          {
            id: 'wed',
            label: 'Wednesday',
            proposal: 'Move intervals to an easy aerobic run.',
            default: 'accept',
          },
          {
            id: 'thu',
            label: 'Thursday',
            proposal: 'Replace tempo work with 45 minutes of Z2.',
            default: 'modify',
            modify_placeholder: 'Keep tempo but shorten to 20 minutes?',
          },
          {
            id: 'sat',
            label: 'Saturday',
            proposal: 'Keep the long run, cap it at 90 minutes.',
            default: 'accept',
          },
        ],
      },
      {
        type: 'draft_review',
        title: 'Coach note draft',
        recipient: 'Coach Mira',
        body: 'I am adjusting Thursday to a recovery session because my acute load is elevated. Saturday stays long, but capped at ninety minutes unless sleep rebounds.',
        uncertain_spans: [
          {
            id: 'sleep',
            text: 'unless sleep rebounds',
            reason: 'The agent does not yet know tonight or tomorrow sleep.',
          },
        ],
      },
    ],
  },
  {
    id: 'vocab-v2-orchestration',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'PLAN',
      title: 'Five-day recovery sequence',
      summary: 'A plan, checkpoint, and branch choice in one artifact.',
      timestamp_display: 'Fixture',
      label_color: 'green',
    },
    components: [
      {
        type: 'checkpoint',
        stages: [
          { id: 'notice', label: 'Notice', state: 'done' },
          { id: 'adjust', label: 'Adjust', state: 'current' },
          { id: 'watch', label: 'Watch', state: 'pending' },
          { id: 'resume', label: 'Resume', state: 'pending' },
        ],
        current_status: 'Adjusting the load before the risk becomes a missed block.',
        next_unblock: 'Unblocked when Thursday recovery and Friday sleep are logged.',
      },
      {
        type: 'plan_card',
        goal: 'Lower acute load while preserving Saturday confidence.',
        steps: [
          {
            id: 'd1',
            title: 'Today',
            detail: 'Easy 35 minutes plus mobility.',
            state: 'doing',
          },
          {
            id: 'd2',
            title: 'Thursday',
            detail: 'Recovery ride or rest if resting HR is still elevated.',
            state: 'pending',
            ask: {
              id: 'availability',
              label: 'When could you fit the recovery session?',
              kind: 'choice',
              options: ['Morning', 'Lunch', 'Evening'],
              placeholder: 'morning, lunch, evening',
            },
          },
          {
            id: 'd3',
            title: 'Saturday',
            detail: 'Long run with no fast finish.',
            state: 'pending',
            on_done: {
              type: 'follow_up',
              prompt: 'Saturday long run completed. Ask how it felt and update the recovery plan.',
            },
          },
        ],
      },
      {
        type: 'decision_tree',
        question: 'What should happen if resting HR is still elevated Friday?',
        branches: [
          {
            id: 'high',
            choice: 'Still elevated',
            conclusion: 'Cut Saturday to 60 easy minutes.',
            color: 'amber',
          },
          {
            id: 'normal',
            choice: 'Back near baseline',
            conclusion: 'Keep the 90 minute cap.',
            color: 'green',
          },
        ],
      },
    ],
  },
  {
    id: 'vocab-v2-time',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'SCHEDULE',
      title: 'Recovery week timing',
      summary: 'Scheduling components plus a scheduled trigger proposal.',
      timestamp_display: 'Fixture',
      label_color: 'amber',
    },
    components: [
      {
        type: 'schedule_picker',
        question: 'Pick a check-in slot for Friday.',
        allow_other: true,
        slots: [
          {
            id: 'fri-am',
            date_label: 'Fri May 15',
            time_range: '7:30-7:45 AM',
            note: 'Before the work day',
            preferred: true,
            source: 'calendar',
          },
          {
            id: 'fri-pm',
            date_label: 'Fri May 15',
            time_range: '5:00-5:15 PM',
            note: 'After the commute',
          },
        ],
      },
      {
        type: 'calendar_view',
        title: 'This week',
        range_label: 'May 12-18',
        days: [
          { id: 'mon', name: 'Mon', number: '12', events: [{ id: 'm1', label: 'Easy run', state: 'done' }] },
          { id: 'tue', name: 'Tue', number: '13', today: true, events: [{ id: 't1', label: 'Mobility', state: 'planned' }] },
          { id: 'wed', name: 'Wed', number: '14', events: [{ id: 'w1', label: 'Z2 only', state: 'planned' }] },
          { id: 'thu', name: 'Thu', number: '15', events: [{ id: 'th1', label: 'Recovery', state: 'tentative' }] },
          { id: 'fri', name: 'Fri', number: '16', events: [{ id: 'f1', label: 'Check-in', state: 'planned' }] },
          { id: 'sat', name: 'Sat', number: '17', events: [{ id: 's1', label: 'Long run cap', state: 'planned' }] },
          { id: 'sun', name: 'Sun', number: '18', events: [] },
        ],
      },
      {
        type: 'heatmap',
        title: 'Load intensity',
        streak_label: '14 days',
        day_labels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
        values: [
          { date: '2026-05-01', value: 1 },
          { date: '2026-05-02', value: 2 },
          { date: '2026-05-03', value: 0 },
          { date: '2026-05-04', value: 3 },
          { date: '2026-05-05', value: 4 },
          { date: '2026-05-06', value: 1 },
          { date: '2026-05-07', value: 2 },
          { date: '2026-05-08', value: 4 },
          { date: '2026-05-09', value: 3 },
          { date: '2026-05-10', value: 0 },
          { date: '2026-05-11', value: 2 },
          { date: '2026-05-12', value: 1 },
          { date: '2026-05-13', value: 1 },
          { date: '2026-05-14', value: 3 },
        ],
        max: 4,
      },
      {
        type: 'trigger_proposal',
        rationale: 'A weekly review catches load spikes before they become urgent.',
        cadence_label: 'Every Sunday at 7 AM',
        cron: '0 7 * * 0',
        action: 'Review recent training load, sleep, and race plan. Recommend next week adjustments if acute load is drifting high.',
        alternatives: [
          { label: 'Every Monday at 8 AM', cron: '0 8 * * 1' },
          { label: 'Every Friday at 5 PM', cron: '0 17 * * 5' },
        ],
      },
    ],
  },
  {
    id: 'vocab-v2-markup',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'REVIEW',
      title: 'Annotated source review',
      summary: 'Text, diff, transcript, and image annotations rendered together.',
      timestamp_display: 'Fixture',
      label_color: 'cool',
    },
    components: [
      {
        type: 'annotated_text',
        source_label: 'Training plan note',
        content: 'Thursday intervals can move if fatigue remains high. Saturday long run should stay aerobic.',
        annotations: [
          {
            id: 'fatigue',
            text: 'fatigue remains high',
            note: 'Mapped to resting HR and sleep observations.',
            color: 'amber',
          },
          {
            id: 'aerobic',
            text: 'stay aerobic',
            note: 'No fast finish this week.',
            color: 'green',
          },
        ],
      },
      {
        type: 'diff',
        before_label: 'Original',
        after_label: 'Revised',
        before: 'Thursday: intervals. Saturday: long run with fast finish.',
        after: 'Thursday: recovery Z2. Saturday: long run, aerobic only.',
      },
      {
        type: 'transcript',
        source_label: 'Voice note',
        lines: [
          {
            id: 'l1',
            time: '00:04',
            speaker: 'User',
            text: 'I can move Thursday, but I do not want to lose the long run.',
            pinned: true,
            note: 'Converted into the counter proposal above.',
          },
          {
            id: 'l2',
            time: '00:13',
            speaker: 'User',
            text: 'If sleep is bad Friday, cut the duration.',
          },
        ],
      },
      {
        type: 'annotated_image',
        caption: 'Route sketch with risk points.',
        markers: [
          { id: 'p1', x: 0.24, y: 0.38, label: 'Hill start', note: 'Keep this easy.', color: 'amber' },
          { id: 'p2', x: 0.68, y: 0.64, label: 'Flat finish', note: 'No fast finish this week.', color: 'green' },
        ],
      },
    ],
  },
  {
    id: 'vocab-v2-memory',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'BRIEF',
      title: 'Session memory snapshot',
      summary: 'What the agent believes, what it is doing, and what it deferred.',
      timestamp_display: 'Fixture',
      label_color: 'muted',
    },
    components: [
      {
        type: 'session_brief',
        goal: 'Arrive healthy for the May 31 race.',
        facts: [
          { key: 'Race', value: 'May 31 half marathon', confidence: 'high', last_seen: 'today' },
          { key: 'Risk', value: 'load spike from back-to-back hard days', confidence: 'medium', last_seen: '2h ago' },
          { key: 'Preference', value: 'protect Saturday long run', confidence: 'high', last_seen: 'voice note' },
        ],
        open_threads: ['Friday sleep check', 'shoe mileage', 'weather for Saturday'],
      },
      {
        type: 'agent_tasks',
        tasks: [
          {
            id: 'watch-load',
            label: 'Watch training load',
            state: 'scheduled',
            cadence: 'weekly',
            detail: 'Agent-authored state, not the internal run queue.',
          },
          {
            id: 'wait-sleep',
            label: 'Wait for Friday sleep signal',
            state: 'waiting_on_external',
          },
        ],
      },
      {
        type: 'deferred_list',
        items: [
          {
            id: 'weather',
            text: 'Saturday wind forecast',
            reason: 'Relevant, but not needed until the route is final.',
          },
          {
            id: 'shoes',
            text: 'Shoe rotation',
            reason: 'Not urgent unless mileage crosses 350.',
          },
        ],
      },
    ],
  },
  {
    id: 'vocab-v2-decisions',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'DECISION',
      title: 'Bid selection support',
      summary: 'Weighted matrix, qualitative ledger, and reorderable priorities.',
      timestamp_display: 'Fixture',
      label_color: 'green',
    },
    components: [
      {
        type: 'decision_matrix',
        options: ['Apex', 'Birch', 'Volt'],
        criteria: [
          { id: 'cost', label: 'Cost control', weight: 0.35, scores: { Apex: 6, Birch: 9, Volt: 7 } },
          { id: 'speed', label: 'Timeline', weight: 0.25, scores: { Apex: 8, Birch: 6, Volt: 7 } },
          { id: 'scope', label: 'Scope completeness', weight: 0.4, scores: { Apex: 9, Birch: 5, Volt: 8 } },
        ],
        recommended_option: 'Apex',
        rationale: 'Apex costs more but carries the least scope risk.',
      },
      {
        type: 'pros_cons',
        question: 'Should Apex stay the lead option?',
        pros: [
          { text: 'Includes electrical and HVAC coordination.', weight: 3 },
          { text: 'Shortest confirmed timeline.', weight: 2 },
        ],
        cons: [
          { text: 'Highest upfront bid.', weight: 2 },
          { text: 'Requires confirmation on cabinet lead time.', weight: 1 },
        ],
        recommendation: 'Keep Apex first unless cabinet timing slips.',
      },
      {
        type: 'ranking',
        question: 'Rank what matters most before asking for revised bids.',
        items: [
          { id: 'scope', label: 'No missing scope', rationale: 'Avoid change orders.' },
          { id: 'timeline', label: 'Timeline certainty', rationale: 'Protect move-in date.' },
          { id: 'cost', label: 'Lowest cost', rationale: 'Secondary if scope is clean.' },
        ],
      },
    ],
  },
  {
    id: 'vocab-v2-tools',
    session_id: sessionId,
    created_at: now,
    priority: 'low',
    notify: false,
    header: {
      label: 'TOOL',
      title: 'Embedded micro-tools',
      summary: 'Local timer, counter, and scratchpad state inside an artifact.',
      timestamp_display: 'Fixture',
      label_color: 'signal',
    },
    components: [
      {
        type: 'timer',
        id: 'mobility-timer',
        label: 'Mobility block',
        duration_seconds: 600,
        elapsed_seconds: 120,
        mode: 'countdown',
        completion_prompt: 'Mobility timer completed. Ask whether soreness changed.',
      },
      {
        type: 'counter',
        id: 'strides',
        label: 'Strides',
        value: 2,
        target: 6,
        unit: 'reps',
        step: 1,
      },
      {
        type: 'scratchpad',
        id: 'notes',
        title: 'Run notes',
        placeholder: 'Add soreness, fatigue, pace notes...',
        content: 'Legs felt heavy for the first mile.',
        shared_with_agent: true,
        privacy_note: 'Saved notes are sent back to the same session when submitted.',
        submit_label: 'Save notes',
      },
    ],
  },
  {
    id: 'vocab-v2-structure',
    session_id: sessionId,
    created_at: now,
    priority: 'normal',
    notify: false,
    header: {
      label: 'MAP',
      title: 'Relational structures',
      summary: 'Network, hierarchy, and flow renderers for graph-shaped information.',
      timestamp_display: 'Fixture',
      label_color: 'cool',
    },
    components: [
      {
        type: 'network',
        nodes: [
          { id: 'sleep', label: 'Sleep', color: 'cool', x: 0.2, y: 0.35 },
          { id: 'load', label: 'Load', color: 'amber', x: 0.5, y: 0.2, size: 'lg' },
          { id: 'hr', label: 'HR', color: 'red', x: 0.5, y: 0.68 },
          { id: 'plan', label: 'Plan', color: 'green', x: 0.82, y: 0.5 },
        ],
        edges: [
          { source: 'sleep', target: 'hr', label: 'affects', kind: 'related' },
          { source: 'load', target: 'hr', label: 'raises', kind: 'supports', color: 'amber', weight: 2 },
          { source: 'hr', target: 'plan', label: 'guides', kind: 'depends_on' },
        ],
      },
      {
        type: 'tree',
        root_label: 'Kitchen renovation budget',
        nodes: [
          { id: 'total', label: 'Total', value: '$48,200' },
          { id: 'cabinets', label: 'Cabinetry', parent_id: 'total', value: '$18,400' },
          { id: 'base', label: 'Base cabinets', parent_id: 'cabinets', value: '$7,200' },
          { id: 'countertops', label: 'Countertops', parent_id: 'total', value: '$8,900' },
          { id: 'labor', label: 'Labor', parent_id: 'total', value: '$7,800' },
        ],
      },
      {
        type: 'sankey',
        nodes: [
          { id: 'time', label: 'Weekly time' },
          { id: 'run', label: 'Running' },
          { id: 'strength', label: 'Strength' },
          { id: 'recovery', label: 'Recovery' },
        ],
        flows: [
          { source: 'time', target: 'run', value: 7, label: 'hours', color: 'signal' },
          { source: 'time', target: 'strength', value: 2, label: 'hours', color: 'cool' },
          { source: 'time', target: 'recovery', value: 3, label: 'hours', color: 'green' },
        ],
      },
    ],
  },
] satisfies Artifact[]
