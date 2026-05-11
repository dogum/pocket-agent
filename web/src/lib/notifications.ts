// Browser notifications. Thin wrapper around the Notification API.
//
// Two surfaces the rest of the app uses:
//   • requestPermission()        — call from the user's "enable" toggle.
//   • notifyArtifact(artifact)   — call when an artifact arrives. Fires
//                                  iff notifications are enabled in
//                                  settings, the browser permission is
//                                  granted, the artifact has notify=true,
//                                  AND the page is not focused (we don't
//                                  shout when the user is already here).
//
// Returns Notification refs so callers can wire click handlers (we
// route to the artifact and focus the window).

import type { Artifact } from '@shared/index'

import { useSettings } from '../store/useSettings'

export type PermissionState =
  | NotificationPermission
  | 'unsupported'
  | 'unasked'

export function permissionState(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestPermission(): Promise<PermissionState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  const result = await Notification.requestPermission()
  return result
}

export interface NotifyOptions {
  /** Called if the notification is clicked. Receives the artifact id. */
  onClick?: (artifactId: string) => void
}

export function notifyArtifact(
  artifact: Artifact,
  opts: NotifyOptions = {},
): Notification | null {
  const { notifications } = useSettings.getState()
  if (!notifications) return null
  if (typeof Notification === 'undefined') return null
  if (Notification.permission !== 'granted') return null
  if (!artifact.notify) return null
  // Don't shout while the user is already looking.
  if (typeof document !== 'undefined' && !document.hidden) return null

  const n = new Notification(artifact.header.title, {
    body: artifact.header.summary ?? '',
    tag: artifact.id, // dedupes if same artifact arrives twice
    silent: false,
  })
  n.onclick = (): void => {
    n.close()
    if (typeof window !== 'undefined') window.focus()
    opts.onClick?.(artifact.id)
  }
  return n
}
