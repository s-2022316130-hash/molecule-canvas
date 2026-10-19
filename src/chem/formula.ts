// Molecular formula helpers.
// RDKit.js can describe a molecule as JSON but has no "get formula" function,
// so we count the atoms ourselves and then write them in the standard order.

// Element symbols indexed by atomic number (index 0 is unused).
const SYMBOLS = [
  '', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]

/** Element counts, e.g. ethanol → { C: 2, H: 6, O: 1 } */
export type ElementCounts = Record<string, number>

// Shape of the parts of RDKit's get_json() output we use.
// Missing fields fall back to `defaults` (z: 6 = carbon, impHs: 0, chg: 0).
interface RDKitAtom {
  z?: number
  impHs?: number
  chg?: number
}
interface RDKitJson {
  defaults: { atom: Required<RDKitAtom> }
  molecules: { atoms: RDKitAtom[] }[]
}

/** Counts every element (including hydrogens attached to atoms) and the net charge. */
export function countElements(rdkitJson: string): { counts: ElementCounts; charge: number } {
  const data = JSON.parse(rdkitJson) as RDKitJson
  const defaults = data.defaults.atom
  const counts: ElementCounts = {}
  let charge = 0

  for (const atom of data.molecules[0].atoms) {
    const symbol = SYMBOLS[atom.z ?? defaults.z]
    counts[symbol] = (counts[symbol] ?? 0) + 1
    const hydrogens = atom.impHs ?? defaults.impHs
    if (hydrogens > 0) counts.H = (counts.H ?? 0) + hydrogens
    charge += atom.chg ?? defaults.chg
  }
  return { counts, charge }
}

/**
 * Writes element counts as a formula string in Hill order, e.g. { O: 1, C: 2, H: 6 } → "C2H6O".
 *
 * Hill system rules (used by CAS, PubChem, ChemDraw):
 *   - If the molecule contains carbon: C first, then H, then all other elements alphabetically.
 *   - If there is no carbon: every element alphabetically, H included (e.g. NaCl → "ClNa", water → "H2O").
 *   - A count of 1 is not written ("C2H6O", not "C2H6O1").
 */
export function hillFormula(counts: ElementCounts): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0)

  const hasCarbon = entries.some(([symbol]) => symbol === 'C')

  entries.sort(([a], [b]) => {
    if (hasCarbon) {
      if (a === 'C') return -1
      if (b === 'C') return 1
      if (a === 'H') return -1
      if (b === 'H') return 1
    }

    return a.localeCompare(b)
  })

  return entries
    .map(([symbol, n]) => (n === 1 ? symbol : `${symbol}${n}`))
    .join('')
}

/** Turns a net charge into the suffix written after a formula: 1 → "+", -2 → "2−", 0 → "". */
export function chargeSuffix(charge: number): string {
  if (charge === 0) return ''
  const sign = charge > 0 ? '+' : '−'
  const size = Math.abs(charge)
  return size === 1 ? sign : size + sign
}
