import initRDKitModule from '@rdkit/rdkit'
import { beforeAll, describe, expect, it } from 'vitest'
import { addAtom, addBond, applyStereo, emptyMolecule, findBond, type BondOrder, type Molecule } from '../model/molecule.ts'
import { analyze } from './analyze.ts'

type RDKit = Awaited<ReturnType<typeof initRDKitModule>>
let rdkit: RDKit
beforeAll(async () => {
  rdkit = await initRDKitModule()
}, 30_000)

function build(atoms: [string, number, number][], bonds: [number, number, BondOrder][]) {
  let mol: Molecule = emptyMolecule
  const ids: number[] = []
  for (const [element, x, y] of atoms) {
    const added = addAtom(mol, x, y, element)
    mol = added.mol
    ids.push(added.id)
  }
  for (const [a, b, order] of bonds) mol = addBond(mol, ids[a], ids[b], order)
  return { mol, ids }
}

// Lactic acid, CH3–CH(OH)–COOH, laid out like RDKit's own depiction (1.5 Å = 40 px, y flipped).
const k = 40 / 1.5
const lactic = () =>
  build(
    [
      ['C', 0, 0],
      ['C', 1.299 * k, -0.75 * k],
      ['O', 1.299 * k, -2.25 * k],
      ['C', 2.598 * k, 0],
      ['O', 2.598 * k, 1.5 * k],
      ['O', 3.897 * k, -0.75 * k],
    ],
    [[1, 0, 1], [1, 2, 1], [1, 3, 1], [3, 4, 2], [3, 5, 1]],
  )

describe('analyze: stereochemistry', () => {
  it('marks the stereocentre of lactic acid drawn without wedges as undefined (?)', () => {
    const { mol, ids } = lactic()
    expect([...analyze(rdkit, mol)!.atomStereo]).toEqual([[ids[1], '?']])
  })

  it('a hashed bond to the methyl gives (S)-lactic acid, a wedge gives (R)', () => {
    const { mol, ids } = lactic()
    const bond = findBond(mol, ids[1], ids[0])!
    const hashed = analyze(rdkit, applyStereo(mol, bond.id, 'hash', ids[1]))!
    expect(hashed.atomStereo.get(ids[1])).toBe('S')
    expect(hashed.smiles).toBe('C[C@H](O)C(=O)O')
    const wedged = analyze(rdkit, applyStereo(mol, bond.id, 'wedge', ids[1]))!
    expect(wedged.atomStereo.get(ids[1])).toBe('R')
  })

  it('reads E and Z from the drawing of a double bond (2-butene)', () => {
    const butene = (endY: number) =>
      build(
        [['C', -20, 34.64], ['C', 0, 0], ['C', 40, 0], ['C', 60, endY]],
        [[0, 1, 1], [1, 2, 2], [2, 3, 1]],
      )
    const trans = butene(-34.64)
    expect(analyze(rdkit, trans.mol)!.bondStereo.get(findBond(trans.mol, trans.ids[1], trans.ids[2])!.id)).toBe('E')
    const cis = butene(34.64)
    expect(analyze(rdkit, cis.mol)!.bondStereo.get(findBond(cis.mol, cis.ids[1], cis.ids[2])!.id)).toBe('Z')
  })
})
