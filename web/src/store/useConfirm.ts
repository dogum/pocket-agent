// Tiny global confirm-dialog store. Use the imperative `confirm()` from
// anywhere — it returns a promise that resolves to the user's choice.
// The matching <ConfirmDialog/> mounted at the app root reads this
// state and renders the modal.
//
// Usage:
//   const ok = await confirm({
//     title: 'Delete this trigger?',
//     body: 'This will stop the schedule and remove the rule.',
//     confirmLabel: 'Delete',
//     destructive: true,
//   })
//   if (!ok) return
//
// Replaces window.confirm() so popups stay native to the app aesthetic.

import { create } from 'zustand'

export interface ConfirmRequest {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Renders the confirm button as red/destructive. */
  destructive?: boolean
  /** If set, the confirm button is disabled until the user types this exact string. */
  typedConfirm?: string
}

interface OpenState extends ConfirmRequest {
  resolve: (ok: boolean) => void
}

export interface ConfirmStore {
  open: OpenState | null
  request: (req: ConfirmRequest) => Promise<boolean>
  _resolve: (ok: boolean) => void
}

export const useConfirm = create<ConfirmStore>((set, get) => ({
  open: null,
  request: (req) =>
    new Promise<boolean>((resolve) => {
      set({ open: { ...req, resolve } })
    }),
  _resolve: (ok) => {
    const current = get().open
    if (!current) return
    current.resolve(ok)
    set({ open: null })
  },
}))

/** Convenience export so callers don't need to read the store inline. */
export function confirm(req: ConfirmRequest): Promise<boolean> {
  return useConfirm.getState().request(req)
}
