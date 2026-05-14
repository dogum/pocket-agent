// Persisted user preferences. Lives in localStorage under the
// `pocket-agent:settings` key. Separate from useAppStore (ephemeral
// runtime state) so the boundary between "what the user picks" and
// "what the server tells us" is obvious.
//
// `theme = 'auto'` resolves at runtime via prefers-color-scheme.
// All other tokens map to data-attrs / CSS variables on <html>.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ExperienceMode =
  | 'adaptive'
  | 'observatory'
  | 'field_journal'
  | 'daily_edition'
  | 'workbench'
  | 'quiet_atrium'
export type Density = 'editorial' | 'balanced' | 'instrument'
export type Atmosphere = 'minimal' | 'signature' | 'intense'

export interface Settings {
  theme: ThemePreference
  experience: ExperienceMode
  accent: string
  density: Density
  atmosphere: Atmosphere
  grain: boolean
  notifications: boolean
}

const DEFAULTS: Settings = {
  theme: 'auto',
  experience: 'adaptive',
  accent: '#5CB8B2',
  density: 'balanced',
  atmosphere: 'signature',
  grain: true,
  notifications: false,
}

export interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  reset: () => void
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Pick<Settings, typeof key>),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'pocket-agent:settings',
      version: 2,
      migrate: (persisted) => ({
        ...DEFAULTS,
        ...(persisted as Partial<Settings>),
        experience: normalizeExperience(
          (persisted as Partial<Settings>)?.experience,
        ),
      }),
    },
  ),
)

function normalizeExperience(value: unknown): ExperienceMode {
  switch (value) {
    case 'adaptive':
    case 'observatory':
    case 'field_journal':
    case 'daily_edition':
    case 'workbench':
    case 'quiet_atrium':
      return value
    default:
      return DEFAULTS.experience
  }
}

/** Resolve `theme = 'auto'` to an effective 'light' | 'dark' value. */
export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref !== 'auto') return pref
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}
