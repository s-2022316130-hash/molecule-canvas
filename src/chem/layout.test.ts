import initRDKitModule from '@rdkit/rdkit'
import { beforeAll, describe, expect, it } from 'vitest'
import { distance } from '../editor/geometry.ts'
import { addAtom, addBond, emptyMolecule, fragments } from '../model/molecule.ts'
import { cleanUpLayout } from './layout.ts'

type RDKit = Awaited<ReturnType<typeof initRDKitModule>>
let rdkit: RDKit
beforeAll(async () => {
  rdkit = await initRDKitModule()
}, 30_000)

describe('cleanUpLayout', () => {
  it('straightens a squashed chain to proper bond lengths', () => {
    let mol = emptyMolecule
    const ids: number[] = []
    for (const [x, y] of [[0, 0], [5, 3], [9, 0], [14, 4]]) {
      const added = addAtom(mol, x, y)
      mol = added.mol
      ids.push(added.id)
    }
    for (let i = 0; i < 3; i++) mol = addBond(mol, ids[i], ids[i + 1])
    const tidy = cleanUpLayout(rdkit, mol)!
    const [a, b] = tidy.atoms
    expect(distance(a, b)).toBeCloseTo(40, 0)
  })

  it('keeps separate fragments where they were (no overlap)', () => {
    const c1 = addAtom(emptyMolecule, 0, 0)
    const c2 = addAtom(c1.mol, 40, 0)
    const far = addAtom(c2.mol, 400, 0, 'O')
    const mol = addBond(far.mol, c1.id, c2.id)
    expect(fragments(mol)).toHaveLength(2)
    const tidy = cleanUpLayout(rdkit, mol)!
    expect(tidy.atoms.find((a) => a.id === far.id)).toMatchObject({ x: 400, y: 0 })
  })
})
