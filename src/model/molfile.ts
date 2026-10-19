// Converts our molecule model into a MOL file (V2000 "MolBlock").
//
// MOL is the classic text format for chemical structures, read by RDKit,
// ChemDraw, PubChem and almost every chemistry program. It is a fixed-width
// table: one line per atom (x, y, z, element) and one line per bond.
// Spec: "CTfile Formats" by BIOVIA/MDL.

import {
  addAtom,
  addBond,
  applyStereo,
  changeCharge,
  emptyMolecule,
  findBond,
  type BondOrder,
  type BondStereo,
  type Molecule,
} from './molecule.ts'

const PIXELS_PER_BOND = 40 // our drawing's bond length (see BOND_LENGTH in editor/geometry.ts)
const ANGSTROMS_PER_BOND = 1.5 // a typical C–C bond length; MOL coordinates are in ångströms

/** Right-aligns a number in a fixed-width column, e.g. pad(7, 3) → "  7". */
function pad(value: number | string, width: number): string {
  return String(value).padStart(width)
}

function coordinate(pixels: number): string {
  return pad(((pixels / PIXELS_PER_BOND) * ANGSTROMS_PER_BOND).toFixed(4), 10)
}

export function toMolBlock(mol: Molecule, title = ''): string {
  // MOL files number atoms 1, 2, 3… in order, so map our ids to those numbers.
  const index = new Map(mol.atoms.map((atom, i) => [atom.id, i + 1]))

  const lines = [
    title,
    '  MolCanvas         2D',
    '',
    `${pad(mol.atoms.length, 3)}${pad(mol.bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`,
  ]

  for (const atom of mol.atoms) {
    // y is flipped: on screen y grows downwards, in chemistry files it grows upwards.
    const xyz = coordinate(atom.x) + coordinate(-atom.y) + coordinate(0)
    lines.push(`${xyz} ${atom.element.padEnd(3)} 0${'  0'.repeat(11)}`)
  }

  // Bond stereo codes in MOL files: 1 = wedge, 6 = hash, measured from the first atom listed.
  const STEREO_CODE = { wedge: 1, hash: 6 }
  for (const bond of mol.bonds) {
    const stereo = bond.stereo ? STEREO_CODE[bond.stereo] : 0
    lines.push(`${pad(index.get(bond.a1)!, 3)}${pad(index.get(bond.a2)!, 3)}${pad(bond.order, 3)}${pad(stereo, 3)}  0  0  0`)
  }

  // Charges go in "M  CHG" lines, at most 8 atoms per line.
  const charged = mol.atoms.filter((a) => a.charge !== 0)
  for (let i = 0; i < charged.length; i += 8) {
    const chunk = charged.slice(i, i + 8)
    const entries = chunk.map((a) => ` ${pad(index.get(a.id)!, 3)} ${pad(a.charge, 3)}`).join('')
    lines.push(`M  CHG${pad(chunk.length, 3)}${entries}`)
  }

  lines.push('M  END')
  return lines.join('\n')
}

/**
 * Reads the atom positions out of a V2000 MOL file, converted to our canvas pixels.
 * Coordinates are rescaled so the average bond is one drawing bond long,
 * because different layout methods use different bond lengths.
 */
export function readCoordinates(molBlock: string): { x: number; y: number }[] {
  const lines = molBlock.split(/\r?\n/)
  const atomCount = Number(lines[3].slice(0, 3))
  const bondCount = Number(lines[3].slice(3, 6))
  const raw = lines.slice(4, 4 + atomCount).map((line) => ({
    x: Number(line.slice(0, 10)),
    y: -Number(line.slice(10, 20)), // flip back: screen y grows downwards
  }))

  const lengths = lines.slice(4 + atomCount, 4 + atomCount + bondCount).map((line) => {
    const a = raw[Number(line.slice(0, 3)) - 1]
    const b = raw[Number(line.slice(3, 6)) - 1]
    return Math.hypot(a.x - b.x, a.y - b.y)
  })
  const average = lengths.length ? lengths.reduce((s, l) => s + l, 0) / lengths.length : ANGSTROMS_PER_BOND
  const scale = PIXELS_PER_BOND / (average || ANGSTROMS_PER_BOND)
  return raw.map((p) => ({ x: p.x * scale, y: p.y * scale }))
}

// Charge codes used in the atom lines of older MOL files (newer ones use "M  CHG").
const ATOM_BLOCK_CHARGE: Record<number, number> = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 }
const STEREO_FROM_CODE: Record<number, BondStereo> = { 1: 'wedge', 6: 'hash' }

/**
 * Reads a V2000 MOL file into our model (the opposite of toMolBlock).
 * Coordinates are rescaled to the drawing's bond length.
 */
export function fromMolBlock(molBlock: string): Molecule {
  const lines = molBlock.split(/\r?\n/)
  const atomCount = Number(lines[3].slice(0, 3))
  const bondCount = Number(lines[3].slice(3, 6))
  const points = readCoordinates(molBlock)

  let mol: Molecule = emptyMolecule
  const ids: number[] = []
  lines.slice(4, 4 + atomCount).forEach((line, i) => {
    const element = line.slice(31, 34).trim() || 'C'
    const added = addAtom(mol, points[i].x, points[i].y, element)
    const charge = ATOM_BLOCK_CHARGE[Number(line.slice(36, 39))] ?? 0
    mol = charge ? changeCharge(added.mol, added.id, charge) : added.mol
    ids.push(added.id)
  })

  for (const line of lines.slice(4 + atomCount, 4 + atomCount + bondCount)) {
    const a1 = ids[Number(line.slice(0, 3)) - 1]
    const a2 = ids[Number(line.slice(3, 6)) - 1]
    const rawOrder = Number(line.slice(6, 9))
    const order: BondOrder = rawOrder === 2 || rawOrder === 3 ? rawOrder : 1
    mol = addBond(mol, a1, a2, order)
    const stereo = STEREO_FROM_CODE[Number(line.slice(9, 12))]
    if (stereo) mol = applyStereo(mol, findBond(mol, a1, a2)!.id, stereo, a1)
  }

  // "M  CHG" lines: count, then pairs of (atom number, charge). They replace atom-line charges.
  for (const line of lines) {
    if (!line.startsWith('M  CHG')) continue
    const count = Number(line.slice(6, 9))
    for (let k = 0; k < count; k++) {
      const atomNumber = Number(line.slice(10 + k * 8, 13 + k * 8))
      const charge = Number(line.slice(14 + k * 8, 17 + k * 8))
      const id = ids[atomNumber - 1]
      const current = mol.atoms.find((a) => a.id === id)?.charge ?? 0
      mol = changeCharge(mol, id, charge - current)
    }
  }
  return mol
}
