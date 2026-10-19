// "Clean up": ask RDKit for a tidy 2D layout and move our atoms to match.

import type { MainModule } from '@rdkit/rdkit'
import { readCoordinates, toMolBlock } from '../model/molfile.ts'
import { fragments, setPositions, subMolecule, type Molecule } from '../model/molecule.ts'

type Point = { x: number; y: number }

const centre = (ps: readonly Point[]): Point => ({
  x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
  y: ps.reduce((s, p) => s + p.y, 0) / ps.length,
})

/**
 * Returns the molecule with RDKit's layout, or null if RDKit can't read it.
 * Each separate fragment is tidied on its own and stays centred where it was drawn,
 * so separate pieces (e.g. a salt's ions) never end up on top of each other.
 */
export function cleanUpLayout(rdkit: MainModule, mol: Molecule): Molecule | null {
  const positions = new Map<number, Point>()

  for (const ids of fragments(mol)) {
    if (ids.length < 2) continue // a lone atom has nothing to tidy
    const piece = subMolecule(mol, ids)
    const rd = rdkit.get_mol(toMolBlock(piece))
    if (!rd || !rd.is_valid()) {
      rd?.delete()
      return null
    }
    let points: Point[]
    try {
      points = readCoordinates(rd.get_new_coords(true)) // true = use RDKit's CoordGen layout engine
    } finally {
      rd.delete()
    }

    // MOL files keep atoms in the order we wrote them, so point i belongs to piece.atoms[i].
    const before = centre(piece.atoms)
    const after = centre(points)
    piece.atoms.forEach((atom, i) => {
      positions.set(atom.id, { x: points[i].x - after.x + before.x, y: points[i].y - after.y + before.y })
    })
  }
  return positions.size ? setPositions(mol, positions) : null
}
