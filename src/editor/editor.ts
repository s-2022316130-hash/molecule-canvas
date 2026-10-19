// The drawing editor: toolbars + canvas + mouse/keyboard handling.
// Every finished edit makes a new Molecule and records it in History.

import {
  addAtom,
  addBond,
  applyStereo,
  changeCharge,
  cycleBondOrder,
  emptyMolecule,
  findBond,
  getAtom,
  moveAtom,
  neighbors,
  removeAtom,
  removeBond,
  setElement,
  type BondStereo,
  type Molecule,
} from '../model/molecule.ts'
import { valenceProblems } from '../model/valence.ts'
import { angleBetween, newBondAngle, pointAt, snapAngle, type Point } from './geometry.ts'
import { atomAt, bondAt } from './hitTest.ts'
import { History } from './history.ts'
import { render, type Annotations, type Highlight } from './renderer.ts'
import { placeRing, RINGS, type RingTemplate } from './templates.ts'

type Tool = 'draw' | 'wedge' | 'hash' | 'ring' | 'charge+' | 'charge-' | 'move' | 'erase'

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  {
    id: 'draw',
    label: 'Draw',
    hint: 'Click empty space: add the chosen element. Click an atom: grow a bond (or change it to the chosen element). Drag: draw a bond. Click a bond: single → double → triple.',
  },
  {
    id: 'wedge',
    label: 'Wedge',
    hint: 'Bond towards you. Drag from the stereocentre, or click a bond (click again to flip it).',
  },
  {
    id: 'hash',
    label: 'Hash',
    hint: 'Bond away from you. Drag from the stereocentre, or click a bond (click again to flip it).',
  },
  { id: 'ring', label: 'Ring', hint: 'Click empty space, an atom, or a bond to place the chosen ring.' },
  { id: 'charge+', label: '+', hint: 'Click an atom to add a positive charge.' },
  { id: 'charge-', label: '−', hint: 'Click an atom to add a negative charge.' },
  { id: 'move', label: 'Move', hint: 'Drag an atom to move it.' },
  { id: 'erase', label: 'Erase', hint: 'Click an atom or bond to delete it.' },
]

const ELEMENTS = ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I']

// ChemDraw-style hotkeys: hover over an atom and press a letter to change its element.
const ELEMENT_KEYS: Record<string, string> = {
  c: 'C', h: 'H', n: 'N', o: 'O', s: 'S', p: 'P', f: 'F', l: 'Cl', b: 'Br', i: 'I',
}

const DRAG_THRESHOLD = 4 // pixels the mouse must travel before a click counts as a drag

// What the mouse is in the middle of doing, if anything.
type Drag =
  | { kind: 'bond-from-atom'; atomId: number; start: Point; moved: boolean }
  | { kind: 'bond-from-empty'; start: Point; moved: boolean }
  | { kind: 'move-atom'; atomId: number; start: Point; moved: boolean }

export interface EditorOptions {
  /** Called with the molecule after every finished edit, undo or redo. */
  onChange?: (mol: Molecule) => void
  /** The drawing to start with, e.g. restored from autosave. */
  initial?: Molecule
  /** Returns the molecule with a tidy 2D layout, or null if that isn't possible yet. */
  cleanUp?: (mol: Molecule) => Molecule | null
}

export interface EditorApi {
  getMolecule(): Molecule
  /** Replaces the drawing (undoable), e.g. after opening a file. */
  setMolecule(mol: Molecule): void
  /** Shows R/S and E/Z labels (or hides them when undefined). */
  setAnnotations(annotations: Annotations | undefined): void
}

export function mountEditor(container: HTMLElement, options: EditorOptions = {}): EditorApi {
  // Fixed markup only; nothing user-supplied goes into innerHTML.
  container.innerHTML = `
    <div class="toolbar" role="toolbar" aria-label="Drawing tools">
      <div class="tool-group" id="tools"></div>
      <div class="tool-group">
        <button type="button" id="undo" title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" id="redo" title="Redo (Ctrl+Y)">Redo</button>
        <button type="button" id="cleanup" title="Tidy the layout (RDKit 2D coordinates)">Clean up</button>
        <button type="button" id="clear" title="Clear the canvas (can be undone)">Clear</button>
      </div>
    </div>
    <div class="palette" id="elements" role="toolbar" aria-label="Elements"><span class="palette-label">Element</span></div>
    <div class="palette" id="rings" role="toolbar" aria-label="Rings"><span class="palette-label">Ring</span></div>
    <svg class="canvas" viewBox="0 0 720 420" role="img" aria-label="Drawing canvas"></svg>
    <p class="canvas-status"><span id="tool-hint"></span> <span id="counts"></span></p>
  `
  const svg = container.querySelector<SVGSVGElement>('svg')!
  const toolsEl = container.querySelector<HTMLDivElement>('#tools')!
  const elementsEl = container.querySelector<HTMLDivElement>('#elements')!
  const ringsEl = container.querySelector<HTMLDivElement>('#rings')!
  const undoBtn = container.querySelector<HTMLButtonElement>('#undo')!
  const redoBtn = container.querySelector<HTMLButtonElement>('#redo')!
  const cleanupBtn = container.querySelector<HTMLButtonElement>('#cleanup')!
  const clearBtn = container.querySelector<HTMLButtonElement>('#clear')!
  const hintEl = container.querySelector<HTMLSpanElement>('#tool-hint')!
  const countsEl = container.querySelector<HTMLSpanElement>('#counts')!

  const history = new History<Molecule>(options.initial ?? emptyMolecule)
  let tool: Tool = 'draw'
  let element = 'C'
  let ring: RingTemplate = RINGS[0]
  let drag: Drag | null = null
  let draft: Molecule | null = null // a molecule being changed live during a drag (not in history yet)
  let highlight: Highlight = {}
  let preview: [Point, Point] | undefined
  let lastReported: Molecule | null = null
  let annotations: Annotations | undefined // R/S and E/Z labels from RDKit

  function makeButton(parent: HTMLElement, label: string, title: string, onClick: () => void) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.title = title
    button.addEventListener('click', onClick)
    parent.append(button)
    return button
  }

  const toolButtons = TOOLS.map((t) => ({ id: t.id, button: makeButton(toolsEl, t.label, t.hint, () => setTool(t.id)) }))
  const elementButtons = ELEMENTS.map((symbol) => ({
    symbol,
    button: makeButton(elementsEl, symbol, `Draw with ${symbol}`, () => {
      element = symbol
      setTool('draw')
    }),
  }))
  const ringButtons = RINGS.map((r) => ({
    ring: r,
    button: makeButton(ringsEl, r.label, `Place ${r.label.toLowerCase()}`, () => {
      ring = r
      setTool('ring')
    }),
  }))

  function setTool(next: Tool) {
    tool = next
    for (const { id, button } of toolButtons) button.setAttribute('aria-pressed', String(id === next))
    for (const { symbol, button } of elementButtons) button.setAttribute('aria-pressed', String(next === 'draw' && symbol === element))
    for (const { ring: r, button } of ringButtons) button.setAttribute('aria-pressed', String(next === 'ring' && r === ring))
    hintEl.textContent = TOOLS.find((t) => t.id === next)!.hint
    svg.dataset.tool = next
  }

  function redraw() {
    const mol = draft ?? history.current
    const problems = new Set(valenceProblems(mol).map((p) => p.atomId))
    render(svg, mol, { highlight, preview, problems, annotations })
    undoBtn.disabled = !history.canUndo
    redoBtn.disabled = !history.canRedo
    cleanupBtn.disabled = mol.atoms.length < 2
    const atoms = mol.atoms.length
    const bonds = mol.bonds.length
    countsEl.textContent = `· ${atoms} atom${atoms === 1 ? '' : 's'}, ${bonds} bond${bonds === 1 ? '' : 's'}`

    // Tell the outside world about finished changes only (not every frame of a drag).
    if (history.current !== lastReported) {
      lastReported = history.current
      options.onChange?.(history.current)
    }
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

  /** The stereo kind the current tool draws, if it's the Wedge or Hash tool. */
  const stereoTool = (): BondStereo | undefined => (tool === 'wedge' || tool === 'hash' ? tool : undefined)

  /**
   * Adds a bond from atom `fromId` to `end`, creating a carbon at the end if needed.
   * With the Wedge/Hash tool the bond becomes a stereo bond, narrow end at `fromId`.
   */
  function bondTo(mol: Molecule, fromId: number, end: { point: Point; atomId?: number }): Molecule {
    let result = mol
    let endId = end.atomId
    if (endId === undefined) {
      const added = addAtom(result, end.point.x, end.point.y)
      result = added.mol
      endId = added.id
    }
    const stereo = stereoTool()
    if (!stereo) return addBond(result, fromId, endId)
    if (!findBond(result, fromId, endId)) result = addBond(result, fromId, endId)
    return applyStereo(result, findBond(result, fromId, endId)!.id, stereo, fromId)
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    const p = toCanvas(e)
    const mol = history.current
    const atom = atomAt(mol, p)
    const bond = atom ? undefined : bondAt(mol, p)

    switch (tool) {
      case 'erase':
        if (atom) commit(removeAtom(mol, atom.id))
        else if (bond) commit(removeBond(mol, bond.id))
        return
      case 'charge+':
      case 'charge-':
        if (atom) commit(changeCharge(mol, atom.id, tool === 'charge+' ? 1 : -1))
        return
      case 'ring':
        commit(
          placeRing(
            mol,
            ring,
            atom ? { kind: 'atom', atomId: atom.id } : bond ? { kind: 'bond', bondId: bond.id } : { kind: 'point', p },
          ),
        )
        return
      case 'move':
        if (!atom) return
        drag = { kind: 'move-atom', atomId: atom.id, start: p, moved: false }
        break
      case 'wedge':
      case 'hash':
        if (atom) drag = { kind: 'bond-from-atom', atomId: atom.id, start: p, moved: false }
        else if (bond) {
          // Clicking a bond wedges it, narrow end at whichever atom the click was nearer.
          const a1 = getAtom(mol, bond.a1)!
          const a2 = getAtom(mol, bond.a2)!
          const nearer = Math.hypot(p.x - a1.x, p.y - a1.y) <= Math.hypot(p.x - a2.x, p.y - a2.y) ? a1 : a2
          return commit(applyStereo(mol, bond.id, tool, nearer.id))
        } else drag = { kind: 'bond-from-empty', start: p, moved: false }
        break
      case 'draw':
        if (atom) drag = { kind: 'bond-from-atom', atomId: atom.id, start: p, moved: false }
        else if (bond) return commit(cycleBondOrder(mol, bond.id))
        else drag = { kind: 'bond-from-empty', start: p, moved: false }
        break
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
      } else if (tool === 'draw' && from.element !== element) {
        commit(setElement(mol, from.id, element)) // clicking with N chosen turns the atom into N
      } else {
        // A simple click on an atom grows a new bond in a sensible direction.
        const angles = neighbors(mol, from.id).map((n) => angleBetween(from, n))
        const point = pointAt(from, newBondAngle(angles))
        const existing = atomAt(mol, point, from.id)
        commit(bondTo(mol, from.id, existing ? { point: existing, atomId: existing.id } : { point }))
      }
      return
    }

    // Started on empty canvas: a click adds one atom, a drag adds a whole bond.
    const first = addAtom(mol, finished.start.x, finished.start.y, tool === 'draw' ? element : 'C')
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

  function undo() {
    history.undo()
    redraw()
  }

  function redo() {
    history.redo()
    redraw()
  }

  undoBtn.addEventListener('click', undo)
  redoBtn.addEventListener('click', redo)
  clearBtn.addEventListener('click', () => commit(emptyMolecule))
  cleanupBtn.addEventListener('click', () => {
    const tidy = options.cleanUp?.(history.current)
    if (tidy) commit(tidy)
  })

  document.addEventListener('keydown', (e) => {
    // Leave typing in text boxes (like the SMILES box) alone.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    const key = e.key.toLowerCase()
    const mod = e.ctrlKey || e.metaKey
    const mol = history.current

    if (e.key === 'Escape') return cancelDrag()
    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault()
      return undo()
    }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault()
      return redo()
    }
    if (mod || e.altKey || drag) return

    const hovered = highlight.atomId
    if (hovered !== undefined && ELEMENT_KEYS[key]) return commit(setElement(mol, hovered, ELEMENT_KEYS[key]))
    if (hovered !== undefined && (e.key === '+' || e.key === '=')) return commit(changeCharge(mol, hovered, 1))
    if (hovered !== undefined && e.key === '-') return commit(changeCharge(mol, hovered, -1))
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (hovered !== undefined) commit(removeAtom(mol, hovered))
      else if (highlight.bondId !== undefined) commit(removeBond(mol, highlight.bondId))
      highlight = {}
      redraw()
    }
  })

  setTool('draw')
  redraw()

  return {
    getMolecule: () => history.current,
    setMolecule: (mol) => {
      highlight = {}
      commit(mol)
    },
    setAnnotations: (next) => {
      annotations = next
      redraw()
    },
  }
}
