// Turns text from outside (a SMILES string, a MOL file, the first record of an SDF file)
// into a drawing. RDKit does the parsing, so every format it understands works.

import type { MainModule } from '@rdkit/rdkit'
import { fromMolBlock } from '../model/molfile.ts'
import { setPositions, type Molecule } from '../model/molecule.ts'

type Point = { x: number; y: number }

/** Moves the whole molecule so its centre sits at `centre`. */
function centredAt(mol: Molecule, centre: Point): Molecule {
  const n = mol.atoms.length || 1
  const cx = mol.atoms.reduce((s, a) => s + a.x, 0) / n
  const cy = mol.atoms.reduce((s, a) => s + a.y, 0) / n
  return setPositions(mol, new Map(mol.atoms.map((a) => [a.id, { x: a.x - cx + centre.x, y: a.y - cy + centre.y }])))
}

/** True when every atom sits on the same spot, i.e. the file had no 2D layout. */
function hasNoLayout(mol: Molecule): boolean {
  return mol.atoms.length > 1 && mol.atoms.every((a) => Math.abs(a.x - mol.atoms[0].x) < 1e-6 && Math.abs(a.y - mol.atoms[0].y) < 1e-6)
}

/** Returns null if RDKit can't read the text. */
export function importStructure(rdkit: MainModule, text: string, centre: Point): Molecule | null {
  const firstRecord = text.split(/^\$\$\$\$/m)[0] // SDF files hold many molecules separated by $$$$
  if (!firstRecord.trim()) return null
  // A MOL file's first line is its title and may be blank, so only trim the end of multi-line text.
  const input = firstRecord.trim().includes('\n') ? firstRecord.trimEnd() : firstRecord.trim()
  const rd = rdkit.get_mol(input)
  if (!rd || !rd.is_valid()) {
    rd?.delete()
    return null
  }
  try {
    // get_molblock gives a V2000 MOL file with 2D coordinates (RDKit adds them for SMILES).
    let mol = fromMolBlock(rd.get_molblock())
    if (hasNoLayout(mol)) mol = fromMolBlock(rd.get_new_coords(true))
    return centredAt(mol, centre)
  } finally {
    rd.delete()
  }
}
