import initRDKitModule from '@rdkit/rdkit'
import { beforeAll, describe, expect, it } from 'vitest'
import { fromMolBlock, readCoordinates, toMolBlock } from './molfile.ts'
import { addAtom, addBond, applyStereo, emptyMolecule, type BondOrder, type Molecule } from './molecule.ts'

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

describe('readCoordinates', () => {
  it('reads back what toMolBlock wrote', () => {
    const mol = build([['C', 0, 0], ['C', 40, 0], ['O', 60, -34.64]], [[0, 1, 1], [1, 2, 1]])
    const points = readCoordinates(toMolBlock(mol))
    expect(points[1].x - points[0].x).toBeCloseTo(40)
    expect(points[2].y - points[1].y).toBeCloseTo(-34.64, 1)
  })

  it('rescales a layout with shorter bonds to the drawing bond length', () => {
    const rd = rdkit.get_mol('CCO')!
    const points = readCoordinates(rd.get_new_coords(true))
    rd.delete()
    expect(Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)).toBeCloseTo(40, 0)
  })
})

describe('fromMolBlock', () => {
  it('reads back everything toMolBlock wrote (elements, bonds, charges, stereo, positions)', () => {
    let mol = build([['C', 0, 0], ['N', 40, 0], ['O', 60, -34.64]], [[0, 1, 1], [1, 2, 2]])
    mol = { ...mol, atoms: mol.atoms.map((a) => (a.element === 'N' ? { ...a, charge: 1 } : a)) }
    mol = applyStereo(mol, mol.bonds[0].id, 'hash', mol.atoms[1].id)

    const back = fromMolBlock(toMolBlock(mol))
    expect(back.atoms.map((a) => [a.element, a.charge])).toEqual([['C', 0], ['N', 1], ['O', 0]])
    expect(back.bonds.map((b) => b.order)).toEqual([1, 2])
    expect(back.bonds[0].stereo).toBe('hash')
    expect(back.atoms.find((a) => a.id === back.bonds[0].a1)!.element).toBe('N') // narrow end kept
    expect(back.atoms[1].x - back.atoms[0].x).toBeCloseTo(40)
  })

  it("reads RDKit's MOL output, including charges and wedges", () => {
    const rd = rdkit.get_mol('C[C@H](N)C(=O)[O-]')!
    const mol = fromMolBlock(rd.get_molblock())
    rd.delete()
    expect(mol.atoms.filter((a) => a.charge === -1)).toHaveLength(1)
    expect(mol.bonds.some((b) => b.stereo)).toBe(true)
    expect(smilesOf(mol)).toBe('C[C@H](N)C(=O)[O-]')
  })
})
