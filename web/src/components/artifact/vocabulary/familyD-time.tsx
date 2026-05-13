import { useState, type JSX } from 'react'

import type {
  CalendarViewComponent,
  HeatmapComponent,
  SchedulePickerComponent,
  TriggerProposalComponent,
} from '@shared/index'
import type { VocabularyRendererProps } from './types'

export function CSchedulePicker({
  question,
  slots,
  allow_other,
  submit_label,
  onInteraction,
}: SchedulePickerComponent & VocabularyRendererProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(
    slots.find((slot) => slot.preferred)?.id ?? slots[0]?.id ?? null,
  )
  const [other, setOther] = useState('')
  const [sent, setSent] = useState(false)

  const submit = (): void => {
    setSent(true)
    void onInteraction?.({
      kind: 'schedule_picker.pick',
      component_type: 'schedule_picker',
      component_id: selected ?? undefined,
      payload: {
        selected_slot_id: selected,
        selected_slot: slots.find((slot) => slot.id === selected),
        other,
      },
    })
  }

  return (
    <div className="c-schedule-picker">
      {question && <div className="question">{question}</div>}
      <div className="slot-list">
        {slots.map((slot) => (
          <button
            type="button"
            className={
              selected === slot.id
                ? 'slot selected'
                : slot.preferred
                  ? 'slot preferred'
                  : 'slot'
            }
            key={slot.id}
            onClick={() => setSelected(slot.id)}
          >
            <span className="date">{slot.date_label}</span>
            <strong>{slot.time_range}</strong>
            {slot.note && <span>{slot.note}</span>}
            {slot.source && <em>{slot.source}</em>}
          </button>
        ))}
      </div>
      {allow_other && (
        <input
          type="text"
          placeholder="Suggest another time"
          value={other}
          onChange={(e) => setOther(e.target.value)}
        />
      )}
      <button
        type="button"
        className="btn primary"
        onClick={submit}
        disabled={!selected && !other.trim()}
      >
        {sent ? 'Sent' : (submit_label ?? 'Pick time')}
      </button>
    </div>
  )
}

export function CCalendarView({
  title,
  range_label,
  days,
}: CalendarViewComponent): JSX.Element {
  return (
    <div className="c-calendar-view">
      {(title || range_label) && (
        <div className="calendar-head">
          {title && <strong>{title}</strong>}
          {range_label && <span>{range_label}</span>}
        </div>
      )}
      <div className="calendar-grid">
        {days.map((day) => (
          <div className={day.today ? 'day today' : 'day'} key={day.id}>
            <div className="day-head">
              <span>{day.name}</span>
              <strong>{day.number}</strong>
            </div>
            {(day.events ?? []).map((event) => (
              <div className={'event ' + (event.state ?? 'planned')} key={event.id}>
                {event.time && <span>{event.time}</span>}
                <strong>{event.label}</strong>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function CHeatmap({
  title,
  streak_label,
  day_labels,
  values,
  max,
}: HeatmapComponent): JSX.Element {
  const maximum = max ?? Math.max(1, ...values.map((value) => value.value))
  return (
    <div className="c-heatmap">
      {(title || streak_label) && (
        <div className="heatmap-head">
          {title && <strong>{title}</strong>}
          {streak_label && <span>{streak_label}</span>}
        </div>
      )}
      {day_labels && (
        <div className="heatmap-labels">
          {day_labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      )}
      <div className="heatmap-grid">
        {values.map((entry) => {
          const level = Math.min(4, Math.max(0, Math.ceil((entry.value / maximum) * 4)))
          return (
            <span
              className={'heat-cell level-' + level}
              key={entry.date}
              title={`${entry.date}: ${entry.value}`}
            />
          )
        })}
      </div>
    </div>
  )
}

export function CTriggerProposal({
  rationale,
  cadence_label = 'Scheduled check',
  cron = '0 9 * * *',
  action = 'Run this scheduled check.',
  alternatives,
  onInteraction,
}: TriggerProposalComponent & VocabularyRendererProps): JSX.Element {
  const options = [{ label: cadence_label, cron }, ...(alternatives ?? [])]
  const [selectedCron, setSelectedCron] = useState(cron)
  const [state, setState] = useState<'pending' | 'approving' | 'approved'>(
    'pending',
  )
  const selected = options.find((option) => option.cron === selectedCron) ?? options[0]

  const approve = async (): Promise<void> => {
    if (state !== 'pending') return
    setState('approving')
    try {
      await onInteraction?.({
        kind: 'trigger_proposal.approve',
        component_type: 'trigger_proposal',
        payload: {
          cadence_label: selected.label,
          cron: selected.cron,
          action,
          rationale,
        },
      })
      setState('approved')
    } catch {
      setState('pending')
    }
  }

  return (
    <div className={'c-trigger-proposal state-' + state}>
      <div className="head">
        <span className="tag">PROPOSED TRIGGER</span>
        <span className="cadence">{selected.label}</span>
      </div>
      {rationale && <p>{rationale}</p>}
      <div className="trigger-action">{action}</div>
      {options.length > 1 && (
        <select
          value={selectedCron}
          onChange={(e) => setSelectedCron(e.target.value)}
          disabled={state !== 'pending'}
        >
          {options.map((option) => (
            <option key={option.cron} value={option.cron}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="btn primary"
        onClick={() => void approve()}
        disabled={state !== 'pending'}
      >
        {state === 'approved'
          ? 'Trigger active'
          : state === 'approving'
            ? 'Approving...'
            : 'Approve trigger'}
      </button>
    </div>
  )
}
