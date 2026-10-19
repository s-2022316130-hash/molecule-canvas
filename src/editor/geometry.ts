// Geometry helpers for drawing.
//
// Angles are in DEGREES, measured like in maths class: 0° points right,
// 90° points up, 180° left, 270° down. (The screen's y axis points down,
// so the conversions below flip y.)

export const BOND_LENGTH = 40 // pixels, like ChemDraw's default "fixed length"

export interface Point {
  readonly x: number
  readonly y: number
}

/** Brings any angle into the range 0 ≤ angle < 360, e.g. -90 → 270, 450 → 90. */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** Direction from one point to another, in degrees. */
export function angleBetween(from: Point, to: Point): number {
  return normalizeAngle((Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI)
}

/** The point `length` pixels away from `from` in direction `deg`. */
export function pointAt(from: Point, deg: number, length = BOND_LENGTH): Point {
  const rad = (deg * Math.PI) / 180
  return { x: from.x + length * Math.cos(rad), y: from.y - length * Math.sin(rad) }
}

/** Rounds an angle to the nearest multiple of `step` (ChemDraw snaps bonds to 30°). */
export function snapAngle(deg: number, step = 30): number {
  return normalizeAngle(Math.round(deg / step) * step)
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Chooses the direction for a new bond when you click an existing atom.
 * `existing` holds the directions of the bonds the atom already has.
 */
export function newBondAngle(existing: number[]): number {
  if (existing.length === 0) return 30 // a lone atom: go up and to the right

  if (existing.length === 1) {
    // Zigzag chains: 120° away from the one existing bond, choosing the
    // more horizontal of the two options so the chain keeps going sideways.
    const [a, b] = [normalizeAngle(existing[0] + 120), normalizeAngle(existing[0] - 120)]
    const horizontalness = (deg: number) => Math.abs(Math.cos((deg * Math.PI) / 180))
    return horizontalness(a) >= horizontalness(b) ? a : b
  }

  return bisectLargestGap(existing)
}

/**
 * Finds the widest empty space between existing bonds and points into its middle.
 *
 * Example: bonds at 210° and 330° leave gaps of 120° (from 210 to 330)
 * and 240° (from 330 round past 0 to 210). The larger gap's middle is 90°, straight up.
 *
 * Steps:
 *   1. Sort the angles from smallest to largest.
 *   2. Look at each neighbouring pair: the gap is next − current.
 *   3. Don't forget the wrap-around gap from the LAST angle back to the FIRST (first + 360 − last).
 *   4. Return the middle of the largest gap: start + gap / 2, passed through normalizeAngle.
 */
export function bisectLargestGap(angles: number[]): number {
  const sorted = angles.map(normalizeAngle).sort((a, b) => a - b)

  // Start with the wrap-around gap: from the last angle, past 0°, to the first.
  let bestStart = sorted[sorted.length - 1]
  let bestGap = sorted[0] + 360 - bestStart

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i]
    if (gap > bestGap) {
      bestStart = sorted[i]
      bestGap = gap
    }
  }
  return normalizeAngle(bestStart + bestGap / 2)
}
