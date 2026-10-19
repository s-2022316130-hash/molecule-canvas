import { describe, expect, it } from 'vitest'
import { addAtom, addBond, cycleBondOrder, emptyMolecule } from './molecule.ts'
import { implicitHydrogens, maxValence, valenceProblems } from './valence.ts'

describe('maxValence', () => {
  it('knows the common neutral valences', () => {
    expect(maxValence('C')).toBe(4)
    expect(maxValence('N')).toBe(3)
    expect(maxValence('O')).toBe(2)
    expect(maxValence('S')).toBe(6)
  })

  it('treats charged atoms like the element with the same electron count', () => {
    expect(maxValence('N', +1)).toBe(4) // ammonium N⁺ ≈ C
    expect(maxValence('O', +1)).toBe(3) // oxonium O⁺ ≈ N
    expect(maxValence('O', -1)).toBe(1) // alkoxide O⁻ ≈ F
    expect(maxValence('C', +1)).toBe(3) // carbocation C⁺ ≈ B
  })

  it('does not guess for elements it does not know', () => {
    expect(maxValence('Xe')).toBeUndefined()
  })
})

describe('valenceProblems', () => {
  /** A central carbon bonded to `n` other carbons. */
  function star(n: number) {
    const centre = addAtom(emptyMolecule, 0, 0)
    let mol = centre.mol
    for (let i = 0; i < n; i++) {
      const other = addAtom(mol, 40 * Math.cos(i), 40 * Math.sin(i))
      mol = addBond(other.mol, centre.id, other.id)
    }
    return { mol, centreId: centre.id }
  }

  it('accepts a carbon with four bonds (neopentane)', () => {
    expect(valenceProblems(star(4).mol)).toEqual([])
  })

  it('flags a carbon with five bonds', () => {
    const { mol, centreId } = star(5)
    expect(valenceProblems(mol)).toEqual([{ atomId: centreId, element: 'C', bonds: 5, max: 4 }])
  })

  it('counts a double bond as two', () => {
    let { mol, centreId } = star(3)
    mol = cycleBondOrder(mol, mol.bonds[0].id) // one double + two single = 4: fine
    expect(valenceProblems(mol)).toEqual([])
    mol = cycleBondOrder(mol, mol.bonds[1].id) // two double + one single = 5: too many
    expect(valenceProblems(mol)).toMatchObject([{ atomId: centreId, bonds: 5 }])
  })
})

describe('implicitHydrogens', () => {
  function single(element: string, charge = 0) {
    const added = addAtom(emptyMolecule, 0, 0, element)
    const mol = { ...added.mol, atoms: added.mol.atoms.map((a) => ({ ...a, charge })) }
    return { mol, id: added.id }
  }

  it('fills a lone atom up to its normal valence', () => {
    const c = single('C')
    expect(implicitHydrogens(c.mol, c.id)).toBe(4) // CH4
    const o = single('O')
    expect(implicitHydrogens(o.mol, o.id)).toBe(2) // H2O
  })

  it('accounts for charge', () => {
    const n = single('N', +1)
    expect(implicitHydrogens(n.mol, n.id)).toBe(4) // NH4+
    const o = single('O', -1)
    expect(implicitHydrogens(o.mol, o.id)).toBe(1) // OH-
  })

  it('counts the bonds already present (ethanol oxygen has one H)', () => {
    const c = addAtom(emptyMolecule, 0, 0)
    const o = addAtom(c.mol, 40, 0, 'O')
    const mol = addBond(o.mol, c.id, o.id)
    expect(implicitHydrogens(mol, o.id)).toBe(1)
    expect(implicitHydrogens(mol, c.id)).toBe(3)
  })
})
