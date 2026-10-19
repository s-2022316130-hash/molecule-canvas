import initRDKitModule from '@rdkit/rdkit'
import { beforeAll, describe, expect, it } from 'vitest'
import { toMolBlock } from '../model/molfile.ts'
import { importStructure } from './importer.ts'

type RDKit = Awaited<ReturnType<typeof initRDKitModule>>
let rdkit: RDKit
beforeAll(async () => {
  rdkit = await initRDKitModule()
}, 30_000)

const centre = { x: 360, y: 210 }

describe('importStructure', () => {
  it('draws a SMILES string, centred where asked', () => {
    const mol = importStructure(rdkit, 'CC(=O)Oc1ccccc1C(=O)O', centre)! // aspirin
    expect(mol.atoms).toHaveLength(13)
    const cx = mol.atoms.reduce((s, a) => s + a.x, 0) / mol.atoms.length
    expect(cx).toBeCloseTo(360)
  })

  it('keeps stereochemistry from the SMILES as wedges', () => {
    const mol = importStructure(rdkit, 'C[C@@H](O)C(=O)O', centre)!
    expect(mol.bonds.some((b) => b.stereo)).toBe(true)
    const rd = rdkit.get_mol(toMolBlock(mol))!
    expect(rd.get_smiles()).toBe('C[C@@H](O)C(=O)O')
    rd.delete()
  })

  it('reads the first molecule of an SDF file', () => {
    const rd = rdkit.get_mol('CCO')!
    const sdf = `${rd.get_molblock()}\n$$$$\n${rd.get_molblock()}\n$$$$\n`
    rd.delete()
    expect(importStructure(rdkit, sdf, centre)!.atoms).toHaveLength(3)
  })

  it('gives null for text that is not a structure', () => {
    expect(importStructure(rdkit, 'definitely not chemistry((', centre)).toBeNull()
    expect(importStructure(rdkit, '   ', centre)).toBeNull()
  })
})
