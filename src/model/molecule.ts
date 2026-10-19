// The molecule model: plain data describing atoms and bonds.
// The screen is always drawn FROM this data; nothing edits the drawing directly.
//
// Every function here returns a NEW molecule and never changes the one passed in.
// That makes undo/redo simple: history is just a list of old molecules.

export type BondOrder = 1 | 2 | 3

export interface Atom {
  readonly id: number
  readonly element: string // e.g. 'C', 'N', 'O'
  readonly x: number // position on the canvas, in pixels
  readonly y: number
  readonly charge: number
}

export interface Bond {
  readonly id: number
  readonly a1: number // id of the first atom
  readonly a2: number // id of the second atom
  readonly order: BondOrder
}

export interface Molecule {
  readonly atoms: readonly Atom[]
  readonly bonds: readonly Bond[]
  readonly nextId: number // the id the next new atom or bond will get
}

export const emptyMolecule: Molecule = { atoms: [], bonds: [], nextId: 1 }

export function getAtom(mol: Molecule, id: number): Atom | undefined {
  return mol.atoms.find((a) => a.id === id)
}

/** The bond joining two atoms, in either direction, if there is one. */
export function findBond(mol: Molecule, a1: number, a2: number): Bond | undefined {
  return mol.bonds.find((b) => (b.a1 === a1 && b.a2 === a2) || (b.a1 === a2 && b.a2 === a1))
}

/** Atoms directly bonded to the given atom. */
export function neighbors(mol: Molecule, atomId: number): Atom[] {
  const ids = mol.bonds.flatMap((b) => (b.a1 === atomId ? [b.a2] : b.a2 === atomId ? [b.a1] : []))
  return ids.map((id) => getAtom(mol, id)!).filter(Boolean)
}

/** Adds an atom and returns the new molecule plus the new atom's id. */
export function addAtom(mol: Molecule, x: number, y: number, element = 'C'): { mol: Molecule; id: number } {
  const atom: Atom = { id: mol.nextId, element, x, y, charge: 0 }
  return { mol: { ...mol, atoms: [...mol.atoms, atom], nextId: mol.nextId + 1 }, id: atom.id }
}

/**
 * Bonds two atoms. If they are already bonded, the existing bond's order is
 * cycled instead (single → double → triple → single), like ChemDraw.
 */
export function addBond(mol: Molecule, a1: number, a2: number, order: BondOrder = 1): Molecule {
  if (a1 === a2 || !getAtom(mol, a1) || !getAtom(mol, a2)) return mol
  const existing = findBond(mol, a1, a2)
  if (existing) return cycleBondOrder(mol, existing.id)
  const bond: Bond = { id: mol.nextId, a1, a2, order }
  return { ...mol, bonds: [...mol.bonds, bond], nextId: mol.nextId + 1 }
}

export function cycleBondOrder(mol: Molecule, bondId: number): Molecule {
  const next: Record<BondOrder, BondOrder> = { 1: 2, 2: 3, 3: 1 }
  return {
    ...mol,
    bonds: mol.bonds.map((b) => (b.id === bondId ? { ...b, order: next[b.order] } : b)),
  }
}

/** Removes an atom and every bond attached to it. */
export function removeAtom(mol: Molecule, atomId: number): Molecule {
  return {
    ...mol,
    atoms: mol.atoms.filter((a) => a.id !== atomId),
    bonds: mol.bonds.filter((b) => b.a1 !== atomId && b.a2 !== atomId),
  }
}

/** Removes a bond, plus any carbon left with no bonds at all (a stray dot is never wanted). */
export function removeBond(mol: Molecule, bondId: number): Molecule {
  const bond = mol.bonds.find((b) => b.id === bondId)
  if (!bond) return mol
  let result: Molecule = { ...mol, bonds: mol.bonds.filter((b) => b.id !== bondId) }
  for (const id of [bond.a1, bond.a2]) {
    const atom = getAtom(result, id)
    if (atom?.element === 'C' && neighbors(result, id).length === 0) result = removeAtom(result, id)
  }
  return result
}

export function moveAtom(mol: Molecule, atomId: number, x: number, y: number): Molecule {
  return { ...mol, atoms: mol.atoms.map((a) => (a.id === atomId ? { ...a, x, y } : a)) }
}

/** Moves many atoms at once, e.g. after "Clean up". Atoms not in the map stay put. */
export function setPositions(mol: Molecule, positions: ReadonlyMap<number, { x: number; y: number }>): Molecule {
  return {
    ...mol,
    atoms: mol.atoms.map((a) => {
      const p = positions.get(a.id)
      return p ? { ...a, x: p.x, y: p.y } : a
    }),
  }
}

export function setElement(mol: Molecule, atomId: number, element: string): Molecule {
  const atom = getAtom(mol, atomId)
  if (!atom || atom.element === element) return mol
  return { ...mol, atoms: mol.atoms.map((a) => (a.id === atomId ? { ...a, element } : a)) }
}

/** Adds `delta` to an atom's charge, kept between −3 and +3. */
export function changeCharge(mol: Molecule, atomId: number, delta: number): Molecule {
  const atom = getAtom(mol, atomId)
  if (!atom) return mol
  const charge = Math.max(-3, Math.min(3, atom.charge + delta))
  if (charge === atom.charge) return mol
  return { ...mol, atoms: mol.atoms.map((a) => (a.id === atomId ? { ...a, charge } : a)) }
}

export function setBondOrder(mol: Molecule, bondId: number, order: BondOrder): Molecule {
  return { ...mol, bonds: mol.bonds.map((b) => (b.id === bondId ? { ...b, order } : b)) }
}

/** Splits the molecule into connected pieces (fragments), each a list of atom ids. */
export function fragments(mol: Molecule): number[][] {
  const seen = new Set<number>()
  const result: number[][] = []
  for (const start of mol.atoms) {
    if (seen.has(start.id)) continue
    const piece: number[] = []
    const stack = [start.id]
    seen.add(start.id)
    while (stack.length) {
      const id = stack.pop()!
      piece.push(id)
      for (const n of neighbors(mol, id)) {
        if (!seen.has(n.id)) {
          seen.add(n.id)
          stack.push(n.id)
        }
      }
    }
    result.push(piece)
  }
  return result
}

/** The part of the molecule made of the given atoms and the bonds between them. */
export function subMolecule(mol: Molecule, atomIds: readonly number[]): Molecule {
  const keep = new Set(atomIds)
  return {
    atoms: mol.atoms.filter((a) => keep.has(a.id)),
    bonds: mol.bonds.filter((b) => keep.has(b.a1) && keep.has(b.a2)),
    nextId: mol.nextId,
  }
}

/** True if the atom already has a double or triple bond. */
export function hasMultipleBond(mol: Molecule, atomId: number): boolean {
  return mol.bonds.some((b) => (b.a1 === atomId || b.a2 === atomId) && b.order > 1)
}
