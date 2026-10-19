// Valence checking: does any atom have more bonds than chemistry allows?
//
// We check this ourselves, before asking RDKit, because RDKit only says
// "invalid molecule", while we can point at the exact atom that's wrong.

import type { Molecule } from './molecule.ts'

// Allowed valences of neutral atoms (the same defaults RDKit uses).
const VALENCES: Record<string, number[]> = {
  H: [1],
  B: [3],
  C: [4],
  N: [3],
  O: [2],
  F: [1],
  Si: [4],
  P: [3, 5, 7],
  S: [2, 4, 6],
  Cl: [1],
  Br: [1],
  I: [1, 3, 5],
}

// Atomic numbers, so a charged atom can borrow the valence of the element
// with the same number of electrons ("isoelectronic"): N⁺ behaves like C, O⁻ like F.
const ATOMIC_NUMBER: Record<string, number> = {
  H: 1, B: 5, C: 6, N: 7, O: 8, F: 9, Si: 14, P: 15, S: 16, Cl: 17, Br: 35, I: 53,
}
const SYMBOL_OF = Object.fromEntries(Object.entries(ATOMIC_NUMBER).map(([s, z]) => [z, s]))

/** Most bonds the atom may have, or undefined for elements we don't check. */
export function maxValence(element: string, charge = 0): number | undefined {
  const z = ATOMIC_NUMBER[element]
  if (z === undefined) return undefined
  const lookalike = SYMBOL_OF[z - charge] // e.g. N with +1 charge → atomic number 6 → C
  const valences = VALENCES[lookalike ?? '']
  return valences ? Math.max(...valences) : undefined
}

/** Total bond order around an atom (a double bond counts 2). */
export function bondOrderSum(mol: Molecule, atomId: number): number {
  return mol.bonds.reduce((sum, b) => sum + (b.a1 === atomId || b.a2 === atomId ? b.order : 0), 0)
}

/**
 * Hydrogens an atom carries without them being drawn, e.g. 1 for the O in ethanol.
 * Uses the smallest allowed valence that fits the bonds already there.
 */
export function implicitHydrogens(mol: Molecule, atomId: number): number {
  const atom = mol.atoms.find((a) => a.id === atomId)
  if (!atom) return 0
  const z = ATOMIC_NUMBER[atom.element]
  const valences = z === undefined ? undefined : VALENCES[SYMBOL_OF[z - atom.charge] ?? '']
  if (!valences) return 0
  const used = bondOrderSum(mol, atomId)
  const fits = valences.find((v) => v >= used)
  return fits === undefined ? 0 : fits - used
}

export interface ValenceProblem {
  atomId: number
  element: string
  bonds: number // total bond order, e.g. a double bond counts 2
  max: number
}

/** Every atom whose bonds add up to more than its maximum valence. */
export function valenceProblems(mol: Molecule): ValenceProblem[] {
  const used = new Map<number, number>()
  for (const bond of mol.bonds) {
    used.set(bond.a1, (used.get(bond.a1) ?? 0) + bond.order)
    used.set(bond.a2, (used.get(bond.a2) ?? 0) + bond.order)
  }

  const problems: ValenceProblem[] = []
  for (const atom of mol.atoms) {
    const max = maxValence(atom.element, atom.charge)
    const bonds = used.get(atom.id) ?? 0
    if (max !== undefined && bonds > max) problems.push({ atomId: atom.id, element: atom.element, bonds, max })
  }
  return problems
}
