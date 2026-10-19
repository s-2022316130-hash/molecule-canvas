// Sends a drawn molecule to RDKit and collects its formula, masses and stereo labels.

import type { MainModule } from '@rdkit/rdkit'
import { toMolBlock } from '../model/molfile.ts'
import { findBond, type Molecule } from '../model/molecule.ts'
import { chargeSuffix, countElements, hillFormula } from './formula.ts'

export interface Analysis {
  formula: string // Hill order, e.g. "C2H6O"
  charge: string // e.g. "+", "2−" or "" when neutral
  mw: number // average molecular weight, g/mol
  exactMass: number // monoisotopic mass
  smiles: string // canonical SMILES (includes @/@@ and / \ when stereo is defined)
  inchi: string // IUPAC International Chemical Identifier ('' if RDKit couldn't make one)
  inchiKey: string // 27-character hashed InChI, handy for searching databases
  atomStereo: Map<number, string> // atom id → "R", "S", or "?" for a stereocentre with no wedge yet
  bondStereo: Map<number, string> // bond id → "E" or "Z"
}

interface StereoTags {
  CIP_atoms: [number, string][] // [atom index, "(R)"]
  CIP_bonds: [number, number, string][] // [atom index, atom index, "(E)"]
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

    // RDKit numbers atoms in MOL-file order (0, 1, 2…), which is the order of mol.atoms.
    // It works out R/S from wedges and E/Z from the 2D geometry of double bonds (CIP rules).
    const inchi = rd.get_inchi()
    const tags = JSON.parse(rd.get_stereo_tags()) as StereoTags
    const strip = (label: string) => label.replace(/[()]/g, '')
    const atomStereo = new Map(tags.CIP_atoms.map(([i, label]) => [mol.atoms[i].id, strip(label)]))
    const bondStereo = new Map<number, string>()
    for (const [i, j, label] of tags.CIP_bonds) {
      const bond = findBond(mol, mol.atoms[i].id, mol.atoms[j].id)
      if (bond) bondStereo.set(bond.id, strip(label))
    }

    return {
      formula: hillFormula(counts),
      charge: chargeSuffix(charge),
      mw: descriptors.amw,
      exactMass: descriptors.exactmw,
      smiles: rd.get_smiles(),
      inchi,
      inchiKey: inchi ? rdkit.get_inchikey_for_inchi(inchi) : '',
      atomStereo,
      bondStereo,
    }
  } finally {
    rd.delete() // free WebAssembly memory
  }
}
