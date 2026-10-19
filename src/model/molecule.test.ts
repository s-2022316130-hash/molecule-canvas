import { describe, expect, it } from 'vitest'
import {
  addAtom,
  applyStereo,
  addBond,
  cycleBondOrder,
  emptyMolecule,
  findBond,
  moveAtom,
  neighbors,
  removeAtom,
  removeBond,
} from './molecule.ts'

/** Builds ethane-like C–C: two carbons and one single bond. */
function twoBondedCarbons() {
  const first = addAtom(emptyMolecule, 0, 0)
  const second = addAtom(first.mol, 40, 0)
  return { mol: addBond(second.mol, first.id, second.id), a: first.id, b: second.id }
}

describe('molecule model', () => {
  it('adds atoms with unique ids', () => {
    const { mol, a, b } = twoBondedCarbons()
    expect(a).not.toBe(b)
    expect(mol.atoms).toHaveLength(2)
    expect(mol.atoms[0].element).toBe('C')
  })

  it('never changes the molecule it was given', () => {
    const before = emptyMolecule
    addAtom(before, 10, 10)
    expect(before.atoms).toHaveLength(0)
  })

  it('bonds two atoms and finds the bond either way round', () => {
    const { mol, a, b } = twoBondedCarbons()
    expect(mol.bonds).toHaveLength(1)
    expect(findBond(mol, b, a)?.order).toBe(1)
    expect(neighbors(mol, a).map((n) => n.id)).toEqual([b])
  })

  it('cycles single → double → triple → single when bonding the same atoms again', () => {
    let { mol, a, b } = twoBondedCarbons()
    mol = addBond(mol, a, b)
    expect(findBond(mol, a, b)?.order).toBe(2)
    mol = addBond(mol, b, a)
    expect(findBond(mol, a, b)?.order).toBe(3)
    mol = addBond(mol, a, b)
    expect(findBond(mol, a, b)?.order).toBe(1)
    expect(mol.bonds).toHaveLength(1)
  })

  it('refuses to bond an atom to itself', () => {
    const { mol, a } = twoBondedCarbons()
    expect(addBond(mol, a, a)).toBe(mol)
  })

  it('removing an atom also removes its bonds', () => {
    const { mol, a } = twoBondedCarbons()
    const after = removeAtom(mol, a)
    expect(after.atoms).toHaveLength(1)
    expect(after.bonds).toHaveLength(0)
  })

  it('removing the only bond also removes the carbons it leaves alone', () => {
    const { mol } = twoBondedCarbons()
    const after = removeBond(mol, mol.bonds[0].id)
    expect(after.atoms).toHaveLength(0)
  })

  it('moves an atom', () => {
    const { mol, a } = twoBondedCarbons()
    const moved = moveAtom(mol, a, 5, 7)
    expect(moved.atoms.find((x) => x.id === a)).toMatchObject({ x: 5, y: 7 })
  })
})

describe('applyStereo', () => {
  it('wedges a bond with the narrow end where asked, then flips on a second click', () => {
    const { mol, a, b } = twoBondedCarbons()
    const bondId = mol.bonds[0].id
    const wedged = applyStereo(mol, bondId, 'wedge', b)
    expect(wedged.bonds[0]).toMatchObject({ a1: b, a2: a, stereo: 'wedge', order: 1 })
    const flipped = applyStereo(wedged, bondId, 'wedge')
    expect(flipped.bonds[0]).toMatchObject({ a1: a, a2: b, stereo: 'wedge' })
  })

  it('switches wedge to hash, and making the bond double removes the stereo', () => {
    const { mol, a } = twoBondedCarbons()
    const bondId = mol.bonds[0].id
    const hashed = applyStereo(applyStereo(mol, bondId, 'wedge', a), bondId, 'hash', a)
    expect(hashed.bonds[0].stereo).toBe('hash')
    expect(cycleBondOrder(hashed, bondId).bonds[0].stereo).toBeUndefined()
  })
})
