// Sends a drawn molecule to RDKit and collects its formula and masses.

import type { MainModule } from '@rdkit/rdkit'
import { toMolBlock } from '../model/molfile.ts'
import type { Molecule } from '../model/molecule.ts'
import { chargeSuffix, countElements, hillFormula } from './formula.ts'

export interface Analysis {
  formula: string // Hill order, e.g. "C2H6O"
  charge: string // e.g. "+", "2−" or "" when neutral
  mw: number // average molecular weight, g/mol
  exactMass: number // monoisotopic mass
  smiles: string // canonical SMILES
}

/** Returns null if RDKit cannot make sense of the molecule. */
export function analyze(rdkit: MainModule, mol: Molecule): Analysis | null {
  const rd = rdkit.get_mol(toMolBlock(mol))
  if (!rd || !rd.is_valid()) {
    rd?.delete()
    return null
  }
  try {
    const descriptors = JSON.parse(rd.get_descriptors()) as { amw: number; exactmw: number }
    const { counts, charge } = countElements(rd.get_json())
    return {
      formula: hillFormula(counts),
      charge: chargeSuffix(charge),
      mw: descriptors.amw,
      exactMass: descriptors.exactmw,
      smiles: rd.get_smiles(),
    }
  } finally {
    rd.delete() // free WebAssembly memory
  }
}
