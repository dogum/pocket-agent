import { useEffect, useState, type JSX } from 'react'

import { Icon } from '../components/icons/Icon'
import { api, type SearchHit } from '../lib/api'
import { useAppStore } from '../store/useAppStore'

export function SearchScreen(): JSX.Element {
  const go = useAppStore((s) => s.go)
  const sessions = useAppStore((s) => s.sessions)

  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)

  // Debounce: query the server at most every 220ms while the user types.
  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      return
    }
    const handle = setTimeout(async () => {
      setLoading(true)
      try {
        const { hits } = await api.search(query)
        setHits(hits)
      } catch {
        setHits([])
      } finally {
        setLoading(false)
      }
    }, 220)
    return () => clearTimeout(handle)
  }, [query])

  return (
    <div className="screen enter" style={{ padding: 'var(--screen-pad)' }}>
      <div
        className="rise"
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div className="t-tag">Search</div>
        <h1 className="t-headline">
          Find anything <em>across</em> sessions
        </h1>

        <div
          className="card"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 14px',
          }}
        >
          <Icon name="search" size={14} />
          <input
            autoFocus
            placeholder="Search artifact text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              fontSize: 14,
              fontFamily: 'var(--sans)',
              color: 'var(--text)',
            }}
          />
        </div>

        {loading && (
          <div className="t-caption" style={{ color: 'var(--text-3)' }}>
            Searching…
          </div>
        )}

        {!loading && query.trim() && hits.length === 0 && (
          <div className="t-body-sm" style={{ color: 'var(--text-3)' }}>
            No matches.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hits.map((hit) => {
            const session = sessions.find((s) => s.id === hit.artifact.session_id)
            return (
              <button
                key={hit.artifact.id}
                type="button"
                onClick={() => go({ name: 'artifact', id: hit.artifact.id })}
                className="card tap"
                style={{
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: 14,
                  width: '100%',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    className={
                      'label ' + (hit.artifact.header.label_color ?? 'signal')
                    }
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'var(--signal)',
                    }}
                  >
                    {hit.artifact.header.label}
                  </span>
                  <span className="t-caption">
                    {hit.artifact.header.timestamp_display}
                  </span>
                </div>
                <div
                  className="t-subtitle"
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: 17,
                    lineHeight: 1.25,
                  }}
                >
                  {hit.artifact.header.title}
                </div>
                <div
                  className="t-body-sm"
                  style={{ color: 'var(--text-2)', lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: hit.snippet }}
                />
                {session && (
                  <div className="t-caption" style={{ marginTop: 2 }}>
                    {session.name}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
