// In-app confirm dialog. Mounts at the app root and listens to the
// useConfirm store. Replaces window.confirm() everywhere so popups
// stay inside the device frame and match the Observatory aesthetic.

import { useEffect, useState, type JSX } from 'react'

import { Icon } from '../icons/Icon'
import { useConfirm } from '../../store/useConfirm'

export function ConfirmDialog(): JSX.Element | null {
  const open = useConfirm((s) => s.open)
  const resolve = useConfirm((s) => s._resolve)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') resolve(false)
      if (e.key === 'Enter' && canConfirm) resolve(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, typed])

  if (!open) return null

  const needsType = !!open.typedConfirm
  const canConfirm = !needsType || typed === open.typedConfirm

  return (
    <>
      <div
        className="sheet-backdrop"
        onClick={() => resolve(false)}
        style={{ zIndex: 200 }}
      />
      <div
        className="sheet"
        style={{
          zIndex: 205,
          maxHeight: 'auto',
          paddingBottom: 22,
        }}
      >
        <div className="handle" />
        <div className="body">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 10,
            }}
          >
            <div
              className="t-tag"
              style={{ color: open.destructive ? 'var(--red)' : 'var(--signal)' }}
            >
              {open.destructive ? 'Confirm action' : 'Confirm'}
            </div>
            <button
              className="icon-btn"
              type="button"
              onClick={() => resolve(false)}
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <h2
            className="t-title"
            style={{ marginBottom: 8, textWrap: 'pretty' }}
          >
            {open.title}
          </h2>
          {open.body && (
            <p className="t-body-sm" style={{ marginBottom: 14 }}>
              {open.body}
            </p>
          )}

          {needsType && (
            <>
              <div className="t-caption" style={{ marginBottom: 6 }}>
                Type <code>{open.typedConfirm}</code> to confirm.
              </div>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={open.typedConfirm}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  color: 'var(--text)',
                  marginBottom: 14,
                }}
              />
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn primary"
              disabled={!canConfirm}
              onClick={() => resolve(true)}
              style={
                open.destructive
                  ? {
                      background: 'var(--red)',
                      boxShadow: '0 4px 18px var(--red-dim)',
                    }
                  : undefined
              }
            >
              {open.confirmLabel ?? (open.destructive ? 'Delete' : 'Confirm')}
            </button>
            <button
              type="button"
              className="btn outline"
              onClick={() => resolve(false)}
            >
              {open.cancelLabel ?? 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
