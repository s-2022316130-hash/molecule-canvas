import { describe, expect, it } from 'vitest'
import { addAtom, addBond, cycleBondOrder, emptyMolecule } from './molecule.ts'
import { maxValence, valenceProblems } from './valence.ts'

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
