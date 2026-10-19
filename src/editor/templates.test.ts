import initRDKitModule from '@rdkit/rdkit'
import { beforeAll, describe, expect, it } from 'vitest'
import { toMolBlock } from '../model/molfile.ts'
import { addAtom, addBond, emptyMolecule, type Molecule } from '../model/molecule.ts'
import { distance } from './geometry.ts'
import { placeRing, RINGS } from './templates.ts'

type RDKit = Awaited<ReturnType<typeof initRDKitModule>>
let rdkit: RDKit
beforeAll(async () => {
  rdkit = await initRDKitModule()
}, 30_000)

const ring = (id: string) => RINGS.find((r) => r.id === id)!

function smilesOf(mol: Molecule): string {
  const rd = rdkit.get_mol(toMolBlock(mol))!
  try {
    return rd.get_smiles()
  } finally {
    rd.delete()
  }
}

describe('placeRing', () => {
  it('places a free benzene with alternating double bonds', () => {
    const mol = placeRing(emptyMolecule, ring('benzene'), { kind: 'point', p: { x: 200, y: 200 } })
    expect(mol.atoms).toHaveLength(6)
    expect(mol.bonds.filter((b) => b.order === 2)).toHaveLength(3)
    expect(smilesOf(mol)).toBe('c1ccccc1')
  })

  it('makes every side one bond length', () => {
    const mol = placeRing(emptyMolecule, ring('cyclopentane'), { kind: 'point', p: { x: 0, y: 0 } })
    for (const b of mol.bonds) {
      const a1 = mol.atoms.find((a) => a.id === b.a1)!
      const a2 = mol.atoms.find((a) => a.id === b.a2)!
      expect(distance(a1, a2)).toBeCloseTo(40)
    }
    expect(smilesOf(mol)).toBe('C1CCCC1')
  })

  it('grows a ring from an existing atom (methylcyclohexane)', () => {
    const methyl = addAtom(emptyMolecule, 0, 0)
    const attach = addAtom(methyl.mol, 40, 0)
    const chain = addBond(attach.mol, methyl.id, attach.id)
    const mol = placeRing(chain, ring('cyclohexane'), { kind: 'atom', atomId: attach.id })
    expect(mol.atoms).toHaveLength(7) // the clicked atom becomes one ring corner
    expect(smilesOf(mol)).toBe('CC1CCCCC1')
  })

  it('fuses two benzenes on a shared bond into naphthalene', () => {
    let mol = placeRing(emptyMolecule, ring('benzene'), { kind: 'point', p: { x: 200, y: 200 } })
    const shared = mol.bonds.find((b) => b.order === 1)!
    mol = placeRing(mol, ring('benzene'), { kind: 'bond', bondId: shared.id })
    expect(mol.atoms).toHaveLength(10)
    expect(mol.bonds).toHaveLength(11)
    expect(smilesOf(mol)).toBe('c1ccc2ccccc2c1')
  })

  it('fuses on the empty side of the bond, not on top of the first ring', () => {
    let mol = placeRing(emptyMolecule, ring('cyclohexane'), { kind: 'point', p: { x: 200, y: 200 } })
    mol = placeRing(mol, ring('cyclohexane'), { kind: 'bond', bondId: mol.bonds[0].id })
    // If the new ring had landed on the old one, its corners would merge and give fewer atoms.
    expect(mol.atoms).toHaveLength(10)
    expect(smilesOf(mol)).toBe('C1CCC2CCCCC2C1')
  })
})
