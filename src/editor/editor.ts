// The drawing editor: toolbar + canvas + mouse/keyboard handling.
// Every finished edit makes a new Molecule and records it in History.

import {
  addAtom,
  addBond,
  cycleBondOrder,
  emptyMolecule,
  getAtom,
  moveAtom,
  neighbors,
  removeAtom,
  removeBond,
  type Molecule,
} from '../model/molecule.ts'
import { angleBetween, newBondAngle, pointAt, snapAngle, type Point } from './geometry.ts'
import { valenceProblems } from '../model/valence.ts'
import { atomAt, bondAt } from './hitTest.ts'
import { History } from './history.ts'
import { render, type Highlight } from './renderer.ts'

type Tool = 'draw' | 'move' | 'erase'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'draw', label: 'Draw', hint: 'Click: add carbon or bond. Drag: draw a bond. Click a bond: single → double → triple.' },
  { id: 'move', label: 'Move', hint: 'Drag an atom to move it.' },
  { id: 'erase', label: 'Erase', hint: 'Click an atom or bond to delete it.' },
]

const DRAG_THRESHOLD = 4 // pixels the mouse must travel before a click counts as a drag

// What the mouse is in the middle of doing, if anything.
type Drag =
  | { kind: 'bond-from-atom'; atomId: number; start: Point; moved: boolean }
  | { kind: 'bond-from-empty'; start: Point; moved: boolean }
  | { kind: 'move-atom'; atomId: number; start: Point; moved: boolean }

/** `onChange` is called with the molecule after every finished edit, undo or redo. */
export function mountEditor(container: HTMLElement, onChange?: (mol: Molecule) => void): void {
  container.innerHTML = `
    <div class="toolbar" role="toolbar" aria-label="Drawing tools">
      <div class="tool-group" id="tools"></div>
      <div class="tool-group">
        <button type="button" id="undo" title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" id="redo" title="Redo (Ctrl+Y)">Redo</button>
        <button type="button" id="clear" title="Clear the canvas (can be undone)">Clear</button>
      </div>
    </div>
    <svg class="canvas" viewBox="0 0 720 420" role="img" aria-label="Drawing canvas"></svg>
    <p class="canvas-status"><span id="tool-hint"></span> <span id="counts"></span></p>
  `
  const svg = container.querySelector<SVGSVGElement>('svg')!
  const toolsEl = container.querySelector<HTMLDivElement>('#tools')!
  const undoBtn = container.querySelector<HTMLButtonElement>('#undo')!
  const redoBtn = container.querySelector<HTMLButtonElement>('#redo')!
  const clearBtn = container.querySelector<HTMLButtonElement>('#clear')!
  const hintEl = container.querySelector<HTMLSpanElement>('#tool-hint')!
  const countsEl = container.querySelector<HTMLSpanElement>('#counts')!

  const history = new History<Molecule>(emptyMolecule)
  let tool: Tool = 'draw'
  let drag: Drag | null = null
  let draft: Molecule | null = null // a molecule being changed live during a drag (not in history yet)
  let highlight: Highlight = {}
  let preview: [Point, Point] | undefined
  let lastReported: Molecule | null = null

  const toolButtons = TOOLS.map((t) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = t.label
    button.title = t.hint
    button.addEventListener('click', () => setTool(t.id))
    toolsEl.append(button)
    return { tool: t, button }
  })

  function setTool(next: Tool) {
    tool = next
    for (const { tool: t, button } of toolButtons) button.setAttribute('aria-pressed', String(t.id === next))
    hintEl.textContent = TOOLS.find((t) => t.id === next)!.hint
    svg.dataset.tool = next
  }

  function redraw() {
    const mol = draft ?? history.current
    const problems = new Set(valenceProblems(mol).map((p) => p.atomId))
    render(svg, mol, highlight, preview, problems)

    // Tell the outside world about finished changes only (not every frame of a drag).
    if (history.current !== lastReported) {
      lastReported = history.current
      onChange?.(history.current)
    }
    undoBtn.disabled = !history.canUndo
    redoBtn.disabled = !history.canRedo
    const atoms = mol.atoms.length
    const bonds = mol.bonds.length
    countsEl.textContent = `· ${atoms} atom${atoms === 1 ? '' : 's'}, ${bonds} bond${bonds === 1 ? '' : 's'}`
  }

  function commit(next: Molecule) {
    history.push(next)
    draft = null
    redraw()
  }

  /** Converts a mouse position on screen into canvas coordinates. */
  function toCanvas(e: PointerEvent): Point {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return { x: p.x, y: p.y }
  }

  /** Where a bond dragged from `from` towards `p` should end: on an atom, or one bond length away at a 30° step. */
  function bondEnd(mol: Molecule, from: Point, p: Point, fromId?: number): { point: Point; atomId?: number } {
    const target = atomAt(mol, p, fromId)
    if (target) return { point: target, atomId: target.id }
    const point = pointAt(from, snapAngle(angleBetween(from, p)))
    const existing = atomAt(mol, point, fromId) // snap onto an atom already sitting there
    return existing ? { point: existing, atomId: existing.id } : { point }
  }

  /** Adds a bond from atom `fromId` to `end`, creating the end atom if needed. */
  function bondTo(mol: Molecule, fromId: number, end: { point: Point; atomId?: number }): Molecule {
    if (end.atomId !== undefined) return addBond(mol, fromId, end.atomId)
    const added = addAtom(mol, end.point.x, end.point.y)
    return addBond(added.mol, fromId, added.id)
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const p = toCanvas(e)
    const mol = history.current
    const atom = atomAt(mol, p)
    const bond = atom ? undefined : bondAt(mol, p)

    if (tool === 'erase') {
      if (atom) commit(removeAtom(mol, atom.id))
      else if (bond) commit(removeBond(mol, bond.id))
      return
    }
    if (tool === 'move') {
      if (atom) drag = { kind: 'move-atom', atomId: atom.id, start: p, moved: false }
    } else if (atom) {
      drag = { kind: 'bond-from-atom', atomId: atom.id, start: p, moved: false }
    } else if (bond) {
      commit(cycleBondOrder(mol, bond.id))
      return
    } else {
      drag = { kind: 'bond-from-empty', start: p, moved: false }
    }
    svg.setPointerCapture(e.pointerId) // keep receiving mouse events even outside the canvas
  })

  svg.addEventListener('pointermove', (e) => {
    const p = toCanvas(e)
    const mol = history.current

    if (!drag) {
      // Just hovering: highlight what a click would act on.
      const atom = atomAt(mol, p)
      const bond = atom ? undefined : bondAt(mol, p)
      const next = { atomId: atom?.id, bondId: bond?.id }
      if (next.atomId !== highlight.atomId || next.bondId !== highlight.bondId) {
        highlight = next
        redraw()
      }
      return
    }

    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < DRAG_THRESHOLD) return
    drag.moved = true

    if (drag.kind === 'move-atom') {
      draft = moveAtom(mol, drag.atomId, p.x, p.y)
    } else if (drag.kind === 'bond-from-atom') {
      const from = getAtom(mol, drag.atomId)!
      preview = [from, bondEnd(mol, from, p, from.id).point]
    } else {
      preview = [drag.start, bondEnd(mol, drag.start, p).point]
    }
    redraw()
  })

  svg.addEventListener('pointerup', (e) => {
    if (!drag) return
    const p = toCanvas(e)
    const mol = history.current
    const finished = drag
    drag = null
    preview = undefined

    if (finished.kind === 'move-atom') {
      if (draft) commit(draft)
      return
    }

    if (finished.kind === 'bond-from-atom') {
      const from = getAtom(mol, finished.atomId)!
      if (finished.moved) {
        commit(bondTo(mol, from.id, bondEnd(mol, from, p, from.id)))
      } else {
        // A simple click on an atom grows a new bond in a sensible direction.
        const angles = neighbors(mol, from.id).map((n) => angleBetween(from, n))
        const point = pointAt(from, newBondAngle(angles))
        const existing = atomAt(mol, point, from.id)
        commit(bondTo(mol, from.id, existing ? { point: existing, atomId: existing.id } : { point }))
      }
      return
    }

    // Started on empty canvas: a click adds one carbon, a drag adds a whole bond.
    const first = addAtom(mol, finished.start.x, finished.start.y)
    commit(finished.moved ? bondTo(first.mol, first.id, bondEnd(mol, finished.start, p)) : first.mol)
  })

  svg.addEventListener('pointerleave', () => {
    if (!drag && (highlight.atomId || highlight.bondId)) {
      highlight = {}
      redraw()
    }
  })

  function cancelDrag() {
    drag = null
    draft = null
    preview = undefined
    redraw()
  }

  undoBtn.addEventListener('click', () => {
    history.undo()
    redraw()
  })
  redoBtn.addEventListener('click', () => {
    history.redo()
    redraw()
  })
  clearBtn.addEventListener('click', () => commit(emptyMolecule))

  document.addEventListener('keydown', (e) => {
    // Leave typing in text boxes (like the SMILES box) alone.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const key = e.key.toLowerCase()
    if (e.key === 'Escape') cancelDrag()
    else if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
      e.preventDefault()
      history.undo()
      redraw()
    } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault()
      history.redo()
      redraw()
    }
  })

  setTool('draw')
  redraw()
}
