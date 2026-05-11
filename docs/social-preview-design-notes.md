# Design notes — `social-preview.png`

> *Notes for future-me, future-collaborators, and anyone wondering why
> the social card looks the way it does.*

## Movement: Observatory Hours

The composition is an instrument at rest — a brass tube before midnight, a lens cap on, a chart drawer half-open. Form lives in restraint: every line drawn, every type set, every spatial decision is the residue of countless removals. What remains is so precisely placed that the negative space carries as much weight as the marks themselves. This is the discipline of a craftsperson who has spent years learning what to leave out.

Color is information, not decoration. A near-black field — the color of a 4 a.m. observatory dome — holds two voices: an ivory that knows it is the page, and a single teal signal that names what matters. The teal does not announce; it indicates. It is the moment a needle settles, the precise glow of a status lamp, the sharp pencil mark on a stellar catalog. Treated like a master jeweller treats their primary stone: rare, deliberate, perfectly placed.

Typography occupies the field like instruments in a glass cabinet — fewer pieces than the cabinet could hold, each chosen with severe judgment. The serif speaks in italic for the word that matters, set in the accent color, while its companion remains upright and ivory. The sans is humanist and quiet, never raising its voice. A monospaced detail anchors the work in instrument-time: a tag, a coordinate, a number stamped on brass. Letterspacing is calibrated with the patience of a typographer who has retraced the same kerning pair hundreds of times.

Geometry, when it appears, is faint and concentric. A ring is the residue of an azimuth dial. A horizontal line is the sweep of a chart recorder, the moment of a meridian transit. These elements are drawn at opacity low enough that they reward the second look — at first they are atmosphere, then they resolve into specific instruments. Painstaking attention; the practiced hand of someone at the absolute top of their field.

Composition is balanced the way an instrument panel is balanced, with weight pulled slightly toward where the human hand would rest. The marks find their gravity in the center; the upper field breathes, untouched. Margins are generous because instruments respect their housing. Nothing edges to the boundary. The whole carries the air of work that has been refined for hours after the first version was already good, then refined again, until what remains could only have come from someone who refused to stop.

The result reads as an artifact — not a poster, not an advertisement, but the cover of a thoughtful technical book, or the engraved label of a precision instrument. The viewer should feel the discipline before they identify the subject.

## Tokens

| Token       | Value      | Used for                                   |
|-------------|------------|--------------------------------------------|
| `field`     | `#08080A`  | Background                                 |
| `signal`    | `#5CB8B2`  | "Agent" italic + scan-bar line + accents   |
| `text`      | `#EFECE7`  | "Pocket" + tagline primary text            |
| `text-2`    | `#A09D98`  | Tagline secondary, mono detail             |
| `hairline`  | `rgba(255,255,255,0.06)` | Concentric rings, fine grid    |

## Typography

| Role     | Face                    | Size | Notes                                                                 |
|----------|-------------------------|------|-----------------------------------------------------------------------|
| Wordmark | Instrument Serif        | 152 pt | "Pocket" upright ivory; "Agent" italic signal-teal                  |
| Tagline  | Instrument Sans 300     | 24 pt  | Sentence-case, generous letter-spacing                              |
| Detail   | IBM Plex Mono 400       | 11 pt  | Uppercase, wide letter-spacing — coordinates / version stamp        |

`Instrument Serif` is the closest available match to the project's actual brand serif (Cormorant). It earns its place additionally for the conceptual rhyme — *Instrument* font, *Observatory* design system, *Pocket Agent* product. The font's name is part of the deduced subtle reference.

## Composition

- Visual weight: center, slightly left of geometric center.
- Concentric rings: subtle hairline at ~8% opacity, centered behind the wordmark.
- Scan-bar: horizontal gradient sweep just above the tagline, signal-teal at low opacity. Echoes the in-app "agent working" motion that is the brand's signature idiom.
- Coordinate/version stamps at upper-right and lower-left in mono — placed where a brass instrument label would be engraved.
- Generous margins (≥ 80 px on every side). Nothing edges to boundary.

## File

- Output: `docs/social-preview.png`
- Dimensions: exactly **1280 × 640** (GitHub social-preview spec)
- Format: PNG, 8-bit RGB, sRGB
