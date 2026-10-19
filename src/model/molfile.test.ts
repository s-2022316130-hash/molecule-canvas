import initRDKitModule from '@rdkit/rdkit'
import { beforeAll, describe, expect, it } from 'vitest'
import { toMolBlock } from './molfile.ts'
import { addAtom, addBond, emptyMolecule, type BondOrder, type Molecule } from './molecule.ts'

type RDKit = Awaited<ReturnType<typeof initRDKitModule>>
let rdkit: RDKit

beforeAll(async () => {
  rdkit = await initRDKitModule()
}, 30_000)

/** Builds a molecule from a list of [element, x, y] atoms and [atomIndex, atomIndex, order] bonds. */
function build(atoms: [string, number, number][], bonds: [number, number, BondOrder][] = []): Molecule {
  let mol = emptyMolecule
  const ids: number[] = []
  for (const [element, x, y] of atoms) {
    const added = addAtom(mol, x, y, element)
    mol = added.mol
    ids.push(added.id)
  }
  for (const [a, b, order] of bonds) mol = addBond(mol, ids[a], ids[b], order)
  return mol
}

/** What RDKit makes of our MOL file, written as canonical SMILES. */
function smilesOf(mol: Molecule): string {
  const rd = rdkit.get_mol(toMolBlock(mol))
  if (!rd) throw new Error('RDKit could not read the MOL file:\n' + toMolBlock(mol))
  try {
    return rd.get_smiles()
  } finally {
    rd.delete()
  }
}

describe('toMolBlock', () => {
  it('writes the fixed-width counts line and atom lines', () => {
    const lines = toMolBlock(build([['C', 0, 0], ['O', 40, 0]], [[0, 1, 1]])).split('\n')
    expect(lines[3]).toBe('  2  1  0  0  0  0  0  0  0  0999 V2000')
    expect(lines[4]).toBe('    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0')
    expect(lines[5].startsWith('    1.5000')).toBe(true) // 40 px = one 1.5 Å bond
    expect(lines.at(-1)).toBe('M  END')
  })

  it('a lone carbon is methane (RDKit adds the hydrogens)', () => {
    expect(smilesOf(build([['C', 0, 0]]))).toBe('C')
  })

  it('ethanol round-trips through RDKit', () => {
    expect(smilesOf(build([['C', 0, 0], ['C', 35, -20], ['O', 70, 0]], [[0, 1, 1], [1, 2, 1]]))).toBe('CCO')
  })

  it('keeps double and triple bonds', () => {
    expect(smilesOf(build([['C', 0, 0], ['C', 40, 0]], [[0, 1, 2]]))).toBe('C=C')
    expect(smilesOf(build([['C', 0, 0], ['C', 40, 0]], [[0, 1, 3]]))).toBe('C#C')
  })

  it('a ring of alternating double bonds is recognised as benzene', () => {
    const hexagon: [string, number, number][] = [0, 60, 120, 180, 240, 300].map((deg) => [
      'C',
      40 * Math.cos((deg * Math.PI) / 180),
      40 * Math.sin((deg * Math.PI) / 180),
    ])
    const ring: [number, number, BondOrder][] = [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 2], [5, 0, 1]]
    expect(smilesOf(build(hexagon, ring))).toBe('c1ccccc1')
  })

  it('writes charges in M  CHG lines', () => {
    let mol = build([['N', 0, 0]])
    mol = { ...mol, atoms: mol.atoms.map((a) => ({ ...a, charge: 1 })) }
    expect(toMolBlock(mol)).toContain('M  CHG  1   1   1')
    expect(smilesOf(mol)).toBe('[NH4+]')
  })
})
