/**
 * Warm, cozy palette with a Vietnamese lacquer feel: cream and sand around a
 * deep jade cloth, vermilion and gold accents.
 */
export const C = {
  cream: 0xf6ecdc,
  creamLight: 0xfff9ee,
  parchment: 0xf0dec4,
  sand: 0xe8cfa9,
  clothLight: 0x3f8a72,
  cloth: 0x2f6f5c,
  clothDark: 0x1f4f42,
  wood: 0x7a4a2e,
  woodDark: 0x52301d,
  cocoa: 0x3a2a1f,
  cocoaSoft: 0x6c4d3c,
  // Darkened from the original 0x9c806c: that shade only hit ~3.1:1 contrast against the cream
  // backgrounds it sits on, failing WCAG AA for normal-size text. This keeps the same warm hue.
  muted: 0x745e4e,
  paprika: 0xc9452a,
  paprikaDark: 0x9a321d,
  gold: 0xd9a63f,
  goldDark: 0xb08128,
  sage: 0x8fa374,
  sageDark: 0x5f7a4a,
  cardFace: 0xfffaf0,
  cardEdge: 0xd8c4a6,
  cardRed: 0xc8402d,
  cardBlack: 0x2e2620,
  cardBack: 0x2f6f5c,
  cardBackInk: 0xf3e6c8,
  shadow: 0x2a1a10
} as const

/** One accent color per seat (there are no teams in Tiến lên). */
export const SEAT_COLORS: number[] = [0xc9452a, 0x2f6f5c, 0xb08128, 0x6b5b95]

export const FONT = {
  display: "Georgia, 'Noto Serif', 'Times New Roman', serif",
  body: "'Segoe UI', 'Helvetica Neue', 'Noto Sans', sans-serif",
  card: "Georgia, 'Times New Roman', serif"
} as const

export const CARD = {
  w: 84,
  h: 120,
  radius: 9
} as const

export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

/** Linear-interpolates two 0xRRGGBB colors; used to ease color swaps (toggle track, hover tints) instead of snapping. */
export function lerpColor(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t))
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff
  const r = Math.round(ar + (br - ar) * k)
  const g = Math.round(ag + (bg - ag) * k)
  const bl = Math.round(ab + (bb - ab) * k)
  return (r << 16) | (g << 8) | bl
}
