// Feed — the home screen. Delegates to the current experience mode while
// keeping the same store/API data flow.

import type { JSX } from 'react'

import { HomeSurface } from './home/HomeSurface'

export function FeedScreen(): JSX.Element {
  return <HomeSurface />
}
