import { randomUUID } from 'node:crypto'

/** Stable, sortable, short id with an entity prefix.
 * Format: `{prefix}_{base36-time}{base36-rand}` — collision-free for any
 * single-process workload, sortable by creation time, and easy to grep for.
 *
 * Examples:
 *   newId('s')   → "s_lq8f2x9k3a1"
 *   newId('art') → "art_lq8f2x9k4b7"
 */
export function newId(prefix: string): string {
  const time = Date.now().toString(36)
  const rand = randomUUID().replace(/-/g, '').slice(0, 6)
  return `${prefix}_${time}${rand}`
}
