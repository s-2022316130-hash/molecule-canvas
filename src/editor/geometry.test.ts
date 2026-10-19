import { describe, expect, it } from 'vitest'
import { angleBetween, bisectLargestGap, newBondAngle, normalizeAngle, pointAt, snapAngle } from './geometry.ts'

describe('angle helpers', () => {
  it('normalizes angles into 0–360', () => {
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(450)).toBe(90)
  })

  it('measures 90° as straight up on screen (y grows downwards)', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(90)
  })

  it('pointAt and angleBetween agree with each other', () => {
    const p = pointAt({ x: 100, y: 100 }, 150)
    expect(angleBetween({ x: 100, y: 100 }, p)).toBeCloseTo(150)
  })

  it('snaps to the nearest 30°', () => {
    expect(snapAngle(44)).toBe(30)
    expect(snapAngle(46)).toBe(60)
    expect(snapAngle(355)).toBe(0)
  })
})

describe('newBondAngle', () => {
  it('starts a lone atom at 30°', () => {
    expect(newBondAngle([])).toBe(30)
  })

  it('makes a zigzag chain', () => {
    // First bond went up-right (30°), so from the new atom the old one is at 210°.
    expect(newBondAngle([210])).toBe(330) // next bond goes down-right
    expect(newBondAngle([150])).toBe(30) // and then up-right again
  })
})

describe('bisectLargestGap', () => {
  it('points into the open side of a chain atom', () => {
    expect(bisectLargestGap([210, 330])).toBeCloseTo(90)
  })

  it('handles the gap that wraps around past 0°', () => {
    expect(bisectLargestGap([0, 90])).toBeCloseTo(225)
    expect(bisectLargestGap([10, 350])).toBeCloseTo(180)
  })

  it('works with three existing bonds, in any order', () => {
    expect(bisectLargestGap([180, 0, 120])).toBeCloseTo(270)
  })

  it('always returns an angle between 0 and 360', () => {
    const result = bisectLargestGap([300, 340])
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(360)
    expect(result).toBeCloseTo(140)
  })
})
