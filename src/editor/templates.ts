// Ring templates: benzene, cyclohexane, cyclopentane…
//
// A ring can be placed three ways, like in ChemDraw:
//   • on empty canvas  → a free-standing ring centred on the click
//   • on an atom       → the ring grows outwards from that atom
//   • on a bond        → a fused ring sharing that bond (e.g. naphthalene)

import {
  addAtom,
  addBond,
  findBond,
  getAtom,
  hasMultipleBond,
  neighbors,
  setBondOrder,
  type Molecule,
} from '../model/molecule.ts'
import { atomAt } from './hitTest.ts'
import { angleBetween, BOND_LENGTH, newBondAngle, normalizeAngle, pointAt, type Point } from './geometry.ts'

export interface RingTemplate {
  id: string
  label: string
  size: number
  aromatic: boolean // alternate double bonds (Kekulé benzene)
}

export const RINGS: RingTemplate[] = [
  { id: 'benzene', label: 'Benzene', size: 6, aromatic: true },
  { id: 'cyclohexane', label: 'Cyclohexane', size: 6, aromatic: false },
  { id: 'cyclopentane', label: 'Cyclopentane', size: 5, aromatic: false },
  { id: 'cyclobutane', label: 'Cyclobutane', size: 4, aromatic: false },
  { id: 'cyclopropane', label: 'Cyclopropane', size: 3, aromatic: false },
  { id: 'cycloheptane', label: 'Cycloheptane', size: 7, aromatic: false },
]

export type RingTarget = { kind: 'point'; p: Point } | { kind: 'atom'; atomId: number } | { kind: 'bond'; bondId: number }

/** Distance from the centre of a regular polygon to a corner. */
function circumradius(size: number): number {
  return BOND_LENGTH / (2 * Math.sin(Math.PI / size))
}

/** Distance from the centre of a regular polygon to the middle of a side. */
function apothem(size: number): number {
  return BOND_LENGTH / (2 * Math.tan(Math.PI / size))
}

/** Works out where the ring's corners go. The first one or two corners may be existing atoms. */
function ringCorners(mol: Molecule, size: number, target: RingTarget): { points: Point[]; fixed: number[] } {
  const step = 360 / size
  const r = circumradius(size)
  const corners = (center: Point, start: number, direction: 1 | -1) =>
    Array.from({ length: size }, (_, i) => pointAt(center, start + direction * i * step, r))

  if (target.kind === 'point') {
    const start = size === 4 ? 45 : 90 // a corner points straight up (squares sit flat)
    return { points: corners(target.p, start, 1), fixed: [] }
  }

  if (target.kind === 'atom') {
    const atom = getAtom(mol, target.atomId)!
    const outward = newBondAngle(neighbors(mol, atom.id).map((n) => angleBetween(atom, n)))
    const center = pointAt(atom, outward, r)
    return { points: corners(center, angleBetween(center, atom), 1), fixed: [atom.id] }
  }

  const bond = mol.bonds.find((b) => b.id === target.bondId)!
  const a = getAtom(mol, bond.a1)!
  const b = getAtom(mol, bond.a2)!
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const across = angleBetween(a, b) + 90 // perpendicular to the bond

  // Put the new ring on the side of the bond with fewer atoms already there.
  const others = [...neighbors(mol, a.id), ...neighbors(mol, b.id)].filter((n) => n.id !== a.id && n.id !== b.id)
  const side = (p: Point) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x))
  const testSide = side(pointAt(mid, across, 1))
  const crowded = others.filter((n) => side(n) === testSide).length
  const away = crowded > others.length - crowded ? across + 180 : across
  const center = pointAt(mid, away, apothem(size))

  // Walk round the ring starting at a, going whichever way reaches b next.
  const startAngle = angleBetween(center, a)
  const towardsB = normalizeAngle(angleBetween(center, b) - startAngle)
  const direction = Math.abs(towardsB - step) < 1 ? 1 : -1
  return { points: corners(center, startAngle, direction), fixed: [a.id, b.id] }
}

export function placeRing(mol: Molecule, ring: RingTemplate, target: RingTarget): Molecule {
  const { points, fixed } = ringCorners(mol, ring.size, target)
  let result = mol

  // Reuse existing atoms where a corner lands on one (closes fused ring systems neatly).
  const ids = points.map((p, i) => {
    if (i < fixed.length) return fixed[i]
    const existing = atomAt(result, p)
    if (existing) return existing.id
    const added = addAtom(result, p.x, p.y)
    result = added.mol
    return added.id
  })

  const newBonds: number[] = []
  for (let i = 0; i < ids.length; i++) {
    const u = ids[i]
    const v = ids[(i + 1) % ids.length]
    if (findBond(result, u, v)) continue
    result = addBond(result, u, v)
    newBonds.push(findBond(result, u, v)!.id)
  }

  // Benzene: make a new bond double whenever neither end already has a double bond.
  // Going round in order gives alternating bonds, and fusing onto another ring still works.
  if (ring.aromatic) {
    for (const bondId of newBonds) {
      const bond = result.bonds.find((b) => b.id === bondId)!
      if (!hasMultipleBond(result, bond.a1) && !hasMultipleBond(result, bond.a2)) {
        result = setBondOrder(result, bondId, 2)
      }
    }
  }
  return result
}
