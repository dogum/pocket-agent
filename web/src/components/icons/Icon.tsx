// Hand-rolled icon set, ported from the prototype.
// Each glyph is a 24×24 viewBox stroke icon. Adding a new one? Match the
// existing weight (1.6 stroke, round caps/joins) so the visual rhythm
// stays consistent.

import type { JSX } from 'react'

export type IconName =
  | 'check'
  | 'arrow-right'
  | 'chevron-right'
  | 'chevron-left'
  | 'close'
  | 'plus'
  | 'search'
  | 'home'
  | 'orbit'
  | 'user'
  | 'share'
  | 'archive'
  | 'export'
  | 'camera'
  | 'mic'
  | 'file'
  | 'link'
  | 'pen'
  | 'bolt'
  | 'eye'
  | 'sparkles'
  | 'shoe'
  | 'sleep'
  | 'nutrition'
  | 'weather'
  | 'money'
  | 'doc'
  | 'lab'
  | 'calendar'
  | 'gear'
  | 'bell'
  | 'cloud'
  | 'lock'
  | 'photo'
  | 'menu'

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 14, className }: IconProps): JSX.Element | null {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  }
  switch (name) {
    case 'check':
      return <svg {...props}><polyline points="4 12 10 18 20 6" /></svg>
    case 'arrow-right':
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    case 'chevron-right':
      return <svg {...props}><polyline points="9 6 15 12 9 18" /></svg>
    case 'chevron-left':
      return <svg {...props}><polyline points="15 6 9 12 15 18" /></svg>
    case 'close':
      return <svg {...props}><path d="M6 6l12 12M18 6L6 18" /></svg>
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>
    case 'search':
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
    case 'home':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="4" rx="1.5" />
          <rect x="14" y="10" width="7" height="11" rx="1.5" />
          <rect x="3" y="13" width="7" height="8" rx="1.5" />
        </svg>
      )
    case 'orbit':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        </svg>
      )
    case 'user':
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
        </svg>
      )
    case 'share':
      return (
        <svg {...props}>
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
          <path d="M8.2 11l7.6-4M8.2 13l7.6 4" />
        </svg>
      )
    case 'archive':
      return <svg {...props}><path d="M3 7h18v3H3zM5 10v10h14V10M9 13h6" /></svg>
    case 'export':
      return <svg {...props}><path d="M12 3v12M7 8l5-5 5 5M5 21h14" /></svg>
    case 'camera':
      return (
        <svg {...props}>
          <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      )
    case 'mic':
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0014 0M12 18v3" />
        </svg>
      )
    case 'file':
      return (
        <svg {...props}>
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6" />
        </svg>
      )
    case 'link':
      return (
        <svg {...props}>
          <path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1" />
        </svg>
      )
    case 'pen':
      return <svg {...props}><path d="M16 3l5 5L8 21H3v-5z" /></svg>
    case 'bolt':
      return <svg {...props}><path d="M13 3L4 14h7l-1 7 9-11h-7z" /></svg>
    case 'eye':
      return (
        <svg {...props}>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...props}>
          <path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" />
        </svg>
      )
    case 'shoe':
      return <svg {...props}><path d="M3 17l4-2 3-7 3 1 1 3 5 1 4 2v3H3z" /></svg>
    case 'sleep':
      return <svg {...props}><path d="M21 15A9 9 0 019 3a7 7 0 1012 12z" /></svg>
    case 'nutrition':
      return (
        <svg {...props}>
          <path d="M7 11a5 5 0 0110 0v3a5 5 0 01-10 0zM12 6V3M9 5l3-2 3 2" />
        </svg>
      )
    case 'weather':
      return (
        <svg {...props}>
          <circle cx="8" cy="8" r="3" />
          <path d="M17 18a4 4 0 100-8 5 5 0 00-9.5 1" />
          <path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
        </svg>
      )
    case 'money':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9.5a2 2 0 012-1.5h2a2 2 0 010 4h-2a2 2 0 000 4h2a2 2 0 002-1.5M12 6v2M12 16v2" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...props}>
          <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h6" />
        </svg>
      )
    case 'lab':
      return (
        <svg {...props}>
          <path d="M10 3v6L4 19a2 2 0 002 2h12a2 2 0 002-2L14 9V3M9 3h6" />
        </svg>
      )
    case 'calendar':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
      )
    case 'gear':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2.1-1.2L14 3h-4l-.5 2.6a7 7 0 00-2.1 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 002.1 1.2L10 21h4l.5-2.6a7 7 0 002.1-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
        </svg>
      )
    case 'bell':
      return (
        <svg {...props}>
          <path d="M6 19V11a6 6 0 1112 0v8M3 19h18M10 22h4" />
        </svg>
      )
    case 'cloud':
      return <svg {...props}><path d="M7 18a5 5 0 010-10 6 6 0 0111 1 4 4 0 01-1 8H7" /></svg>
    case 'lock':
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 018 0v3" />
        </svg>
      )
    case 'photo':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="11" r="2" />
          <path d="M21 17l-6-6-9 9" />
        </svg>
      )
    case 'menu':
      return <svg {...props}><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    default:
      return null
  }
}
