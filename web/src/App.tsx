import { useEffect, type JSX } from 'react'

import { ConfirmDialog } from './components/shell/ConfirmDialog'
import { BottomNav, Device, type NavTab } from './components/shell/Shell'
import { useAmbientEvents } from './hooks/useAmbientEvents'
import { api } from './lib/api'
import { ArtifactDetailScreen } from './screens/ArtifactDetailScreen'
import { FeedScreen } from './screens/FeedScreen'
import { IngestSheet } from './screens/IngestSheet'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { AgentStatesScreen } from './screens/AgentStatesScreen'
import { ComponentLibraryScreen } from './screens/ComponentLibraryScreen'
import { PrivacyScreen } from './screens/PrivacyScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SessionDetailScreen } from './screens/SessionDetailScreen'
import { SessionsScreen } from './screens/SessionsScreen'
import { SourceDetailScreen } from './screens/SourceDetailScreen'
import { SourcesScreen } from './screens/SourcesScreen'
import { TriggersScreen } from './screens/TriggersScreen'
import { VocabularyV2Screen } from './screens/VocabularyV2Screen'
import { useAppStore } from './store/useAppStore'
import { resolveTheme, useSettings } from './store/useSettings'

const NAV_TABS: NavTab[] = ['feed', 'sessions', 'search', 'profile']

export function App(): JSX.Element {
  const route = useAppStore((s) => s.route)
  const setRoot = useAppStore((s) => s.setRoot)
  const setShowIngest = useAppStore((s) => s.setShowIngest)
  const setData = useAppStore((s) => s.setData)
  const loaded = useAppStore((s) => s.loaded)
  const ambientRun = useAppStore((s) => s.ambientRun)
  useAmbientEvents()

  const theme = useSettings((s) => s.theme)
  const accent = useSettings((s) => s.accent)
  const density = useSettings((s) => s.density)
  const atmosphere = useSettings((s) => s.atmosphere)

  // ── Mirror settings onto <html> data-attrs and CSS vars ────────────
  useEffect(() => {
    const root = document.documentElement
    const apply = (): void => {
      root.setAttribute('data-theme', resolveTheme(theme))
      root.setAttribute('data-density', density)
      root.setAttribute('data-scan', atmosphere)
      root.style.setProperty('--signal', accent)
    }
    apply()
    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => apply()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme, accent, density, atmosphere])

  // ── Initial server-state fetch ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [
          state,
          { sessions },
          { artifacts },
          { briefing },
          profile,
          { sources },
        ] = await Promise.all([
          api.getState(),
          api.listSessions(),
          api.listArtifacts({ limit: 30 }),
          api.latestBriefing().catch(() => ({ briefing: null })),
          api.getProfile().catch(() => null),
          api.listSources().catch(() => ({ sources: [] })),
        ])
        if (cancelled) return
        setData({
          sessions,
          artifacts,
          briefing,
          agentReady: state.agent !== null,
          profile: profile
            ? { name: profile.name, stats: profile.stats }
            : null,
          sources,
          loaded: true,
        })
        if (state.first_run && state.agent !== null) {
          setRoot({ name: 'onboarding' })
        }
      } catch (err) {
        if (cancelled) return
        // eslint-disable-next-line no-console
        console.error('initial load failed', err)
        setData({ loaded: true, agentReady: false })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setData, setRoot])

  const screen = (() => {
    if (!loaded) {
      return (
        <div
          className="screen enter"
          style={{
            padding: 'var(--screen-pad)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <div
            className="shimmer"
            style={{ width: 240, height: 28, borderRadius: 6 }}
          />
        </div>
      )
    }
    switch (route.name) {
      case 'feed':
        return <FeedScreen />
      case 'artifact':
        return <ArtifactDetailScreen id={route.id} />
      case 'sessions':
        return <SessionsScreen />
      case 'session':
        return <SessionDetailScreen id={route.id} />
      case 'search':
        return <SearchScreen />
      case 'profile':
        return <ProfileScreen />
      case 'onboarding':
        return <OnboardingScreen />
      case 'privacy':
        return <PrivacyScreen />
      case 'triggers':
        return <TriggersScreen />
      case 'component-library':
        return <ComponentLibraryScreen />
      case 'vocabulary-v2':
        return <VocabularyV2Screen />
      case 'agent-states':
        return <AgentStatesScreen />
      case 'sources':
        return <SourcesScreen />
      case 'source':
        return <SourceDetailScreen id={route.id} />
      default:
        return <FeedScreen />
    }
  })()

  const tab = (NAV_TABS as string[]).includes(route.name)
    ? (route.name as NavTab)
    : null
  const showNav = route.name !== 'onboarding' && loaded

  return (
    <Device time={currentTime()}>
      {screen}
      {ambientRun && (
        <div className="ambient-banner">
          <span className="pulse" />
          <span className="text">{ambientRun.description}</span>
        </div>
      )}
      {showNav && (
        <BottomNav
          current={tab}
          onNav={(t) => setRoot({ name: t })}
          onIngest={() => setShowIngest(true)}
        />
      )}
      <IngestSheet />
      <ConfirmDialog />
    </Device>
  )
}

function currentTime(): string {
  const d = new Date()
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
