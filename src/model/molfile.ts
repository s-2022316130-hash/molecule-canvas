// Converts our molecule model into a MOL file (V2000 "MolBlock").
//
// MOL is the classic text format for chemical structures, read by RDKit,
// ChemDraw, PubChem and almost every chemistry program. It is a fixed-width
// table: one line per atom (x, y, z, element) and one line per bond.
// Spec: "CTfile Formats" by BIOVIA/MDL.

import type { Molecule } from './molecule.ts'

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

  for (const bond of mol.bonds) {
    lines.push(`${pad(index.get(bond.a1)!, 3)}${pad(index.get(bond.a2)!, 3)}${pad(bond.order, 3)}  0  0  0  0`)
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
