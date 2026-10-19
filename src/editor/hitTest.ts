// Works out what is under the mouse, using the model's coordinates
// (not the SVG elements), so it behaves the same however the drawing looks.

import type { Atom, Bond, Molecule } from '../model/molecule.ts'
import { distance, type Point } from './geometry.ts'

const ATOM_RADIUS = 10
const BOND_TOLERANCE = 6

/** The atom closest to `p`, if one is within reach. */
export function atomAt(mol: Molecule, p: Point, exceptId?: number): Atom | undefined {
  let best: Atom | undefined
  let bestDistance = ATOM_RADIUS
  for (const atom of mol.atoms) {
    const d = distance(atom, p)
    if (atom.id !== exceptId && d <= bestDistance) {
      best = atom
      bestDistance = d
    }
  }
  return best
}

/** Shortest distance from point p to the line segment a–b. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (lengthSquared === 0) return distance(p, a)
  // How far along the segment the closest point is, from 0 (at a) to 1 (at b).
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / lengthSquared))
  return distance(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
}

export function bondAt(mol: Molecule, p: Point): Bond | undefined {
  const byId = new Map(mol.atoms.map((a) => [a.id, a]))
  return mol.bonds.find((bond) => {
    const a = byId.get(bond.a1)
    const b = byId.get(bond.a2)
    return a && b && distanceToSegment(p, a, b) <= BOND_TOLERANCE
  })
}
