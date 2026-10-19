import { describe, expect, it } from 'vitest'
import { History } from './history.ts'

describe('History', () => {
  it('undoes and redoes in order', () => {
    const h = new History('a')
    h.push('b')
    h.push('c')
    h.undo()
    expect(h.current).toBe('b')
    h.undo()
    expect(h.current).toBe('a')
    expect(h.canUndo).toBe(false)
    h.redo()
    expect(h.current).toBe('b')
  })

  it('a new edit after undo clears the redo steps', () => {
    const h = new History('a')
    h.push('b')
    h.undo()
    h.push('x')
    expect(h.canRedo).toBe(false)
    expect(h.current).toBe('x')
  })

  it('ignores a push that did not change anything', () => {
    const h = new History('a')
    h.push('a')
    expect(h.canUndo).toBe(false)
  })

  it('undo with nothing to undo is harmless', () => {
    const h = new History('a')
    h.undo()
    expect(h.current).toBe('a')
  })
})
