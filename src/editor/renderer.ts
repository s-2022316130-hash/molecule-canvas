// Draws a Molecule into an <svg> element.
// It only READS the model; all changes go through the model functions.

import { getAtom, neighbors, type Atom, type Bond, type Molecule } from '../model/molecule.ts'
import { implicitHydrogens } from '../model/valence.ts'
import type { Point } from './geometry.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const LABEL_GAP = 9 // how far a bond stops short of a written atom label like "O"
const MULTI_BOND_OFFSET = 3.5 // spacing between the lines of a double/triple bond
const HYDROGEN_FIRST = new Set(['O', 'S', 'F', 'Cl', 'Br', 'I'])

export interface Highlight {
  atomId?: number
  bondId?: number
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  return node
}

/** Skeletal-formula convention: carbons are invisible corners, unless alone or charged. */
export function showsLabel(mol: Molecule, atom: Atom): boolean {
  return atom.element !== 'C' || atom.charge !== 0 || neighbors(mol, atom.id).length === 0
}

function line(from: Point, to: Point, className: string) {
  return el('line', { x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: className })
}

function drawBond(mol: Molecule, bond: Bond, highlighted: boolean): SVGGElement {
  const group = el('g', { class: highlighted ? 'bond highlighted' : 'bond' })
  const a = getAtom(mol, bond.a1)!
  const b = getAtom(mol, bond.a2)!
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / length // unit vector along the bond
  const uy = (b.y - a.y) / length
  const px = -uy // unit vector perpendicular to the bond
  const py = ux

  // Pull the ends back where an atom label is written, so lines don't cross the letters.
  const trimA = showsLabel(mol, a) ? LABEL_GAP : 0
  const trimB = showsLabel(mol, b) ? LABEL_GAP : 0
  const start = { x: a.x + ux * trimA, y: a.y + uy * trimA }
  const end = { x: b.x - ux * trimB, y: b.y - uy * trimB }

  const offsets = bond.order === 1 ? [0] : bond.order === 2 ? [-0.5, 0.5] : [-1, 0, 1]
  for (const k of offsets) {
    const dx = px * k * MULTI_BOND_OFFSET * 2
    const dy = py * k * MULTI_BOND_OFFSET * 2
    group.append(line({ x: start.x + dx, y: start.y + dy }, { x: end.x + dx, y: end.y + dy }, 'bond-line'))
  }
  return group
}

function drawAtom(mol: Molecule, atom: Atom, highlighted: boolean, problem: boolean): SVGGElement {
  const group = el('g', { class: ['atom', highlighted && 'highlighted', problem && 'problem'].filter(Boolean).join(' ') })
  // A soft circle shows which atom the mouse is over (styled in CSS).
  group.append(el('circle', { cx: atom.x, cy: atom.y, r: 9, class: 'atom-halo' }))

  if (showsLabel(mol, atom)) {
    const label = el('text', { x: atom.x, y: atom.y, class: `atom-label element-${atom.element}` })
    label.textContent = atom.element
    group.append(label)

    // Write the hydrogens next to the element (OH, NH2), on the side away from the bonds.
    const halfWidth = atom.element.length === 1 ? 5.5 : 8
    const hydrogens = implicitHydrogens(mol, atom.id)
    const atomNeighbors = neighbors(mol, atom.id)
    const bondsToRight = atomNeighbors.reduce((sum, n) => sum + Math.sign(n.x - atom.x), 0) > 0
    // Lone molecules follow convention: H2O, H2S, HCl (H first) but NH3, CH4 (H last).
    const hydrogenFirst = atomNeighbors.length === 0 && HYDROGEN_FIRST.has(atom.element)
    let rightEdge = atom.x + halfWidth
    if (hydrogens > 0) {
      const onLeft = bondsToRight || hydrogenFirst
      const h = el('text', {
        x: onLeft ? atom.x - halfWidth : atom.x + halfWidth,
        y: atom.y,
        class: `atom-label atom-h ${onLeft ? 'h-left' : 'h-right'} element-${atom.element}`,
      })
      h.append('H')
      if (hydrogens > 1) {
        const count = el('tspan', { dy: 4, class: 'h-count' })
        count.textContent = String(hydrogens)
        h.append(count)
      }
      group.append(h)
      if (!onLeft) rightEdge += hydrogens > 1 ? 17 : 11
    }

    if (atom.charge !== 0) {
      const size = Math.abs(atom.charge)
      const charge = el('text', { x: rightEdge + 3, y: atom.y - 8, class: 'atom-charge' })
      charge.textContent = (size === 1 ? '' : String(size)) + (atom.charge > 0 ? '+' : '−')
      group.append(charge)
    }
  }
  return group
}

/**
 * Redraws the whole molecule. Simple, and fast enough for hand-drawn molecules.
 * `problems` holds ids of atoms to mark in red (e.g. too many bonds).
 */
export function render(
  svg: SVGSVGElement,
  mol: Molecule,
  highlight: Highlight = {},
  preview?: [Point, Point],
  problems: ReadonlySet<number> = new Set(),
) {
  const bonds = el('g', { class: 'bonds' })
  for (const bond of mol.bonds) bonds.append(drawBond(mol, bond, bond.id === highlight.bondId))

  const atoms = el('g', { class: 'atoms' })
  for (const atom of mol.atoms) atoms.append(drawAtom(mol, atom, atom.id === highlight.atomId, problems.has(atom.id)))

  const overlay = el('g', { class: 'overlay' })
  if (preview) overlay.append(line(preview[0], preview[1], 'preview-line'))

  svg.replaceChildren(bonds, atoms, overlay)
}
