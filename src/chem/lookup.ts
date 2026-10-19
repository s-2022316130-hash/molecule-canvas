// Finding structures by name or molecular formula, using PubChem's free PUG REST service
// (pubchem.ncbi.nlm.nih.gov, run by the US National Institutes of Health).
//
// • A name ("aspirin", "caffeine", "2-methylpropan-1-ol") usually gives one compound.
// • A formula ("C6H12O6") gives a list of candidates, because many compounds
//   (isomers) share a formula. The user picks one.

const PUBCHEM = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound'
const PROPERTIES = 'Title,SMILES,MolecularFormula,MolecularWeight'
const MAX_FORMULA_RESULTS = 12

export interface Candidate {
  cid: number // PubChem Compound ID
  title: string // PubChem's common name for it
  formula: string
  mw: number
  smiles: string
}

/**
 * True for text written like a formula: element symbols each followed by an optional count,
 * e.g. "C6H12O6", "CH4", "NaCl". Names fail because they contain runs of lowercase letters.
 */
export function looksLikeFormula(text: string): boolean {
  return /^(?:[A-Z][a-z]?\d*)+$/.test(text.trim())
}

interface PubChemProperty {
  CID: number
  Title?: string
  MolecularFormula?: string
  MolecularWeight?: string | number
  SMILES?: string
  IsomericSMILES?: string // older name for SMILES in PubChem's API
  CanonicalSMILES?: string
}

/** Turns PubChem's JSON reply into candidates, skipping any without a structure. */
export function parsePubChem(json: unknown): Candidate[] {
  const rows = (json as { PropertyTable?: { Properties?: PubChemProperty[] } }).PropertyTable?.Properties ?? []
  return rows.flatMap((row) => {
    const smiles = row.SMILES ?? row.IsomericSMILES ?? row.CanonicalSMILES
    if (!smiles) return []
    return [
      {
        cid: row.CID,
        title: row.Title ?? `CID ${row.CID}`,
        formula: row.MolecularFormula ?? '',
        mw: Number(row.MolecularWeight ?? NaN),
        smiles,
      },
    ]
  })
}

/** Searches PubChem. Returns [] when nothing matches; throws if PubChem can't be reached. */
export async function searchPubChem(query: string, signal?: AbortSignal): Promise<Candidate[]> {
  const text = query.trim()
  if (!text) return []
  const url = looksLikeFormula(text)
    ? `${PUBCHEM}/fastformula/${encodeURIComponent(text)}/property/${PROPERTIES}/JSON?MaxRecords=${MAX_FORMULA_RESULTS}`
    : `${PUBCHEM}/name/${encodeURIComponent(text)}/property/${PROPERTIES}/JSON`

  const response = await fetch(url, { signal })
  if (response.status === 404) return [] // PubChem's way of saying "no match"
  if (!response.ok) throw new Error(`PubChem answered with status ${response.status}`)
  return parsePubChem(await response.json())
}
