import { afterEach, describe, expect, it, vi } from 'vitest'
import { looksLikeFormula, parsePubChem, searchPubChem } from './lookup.ts'

describe('looksLikeFormula', () => {
  it('recognises formulas', () => {
    for (const f of ['C6H12O6', 'CH4', 'NaCl', 'H2O', 'C2H6O']) expect(looksLikeFormula(f)).toBe(true)
  })

  it('treats names as names', () => {
    for (const n of ['aspirin', 'Caffeine', 'Iodine', '2-methylpropan-1-ol', 'sodium chloride']) {
      expect(looksLikeFormula(n)).toBe(false)
    }
  })
})

describe('parsePubChem', () => {
  it('reads the property table, accepting older SMILES field names', () => {
    const json = {
      PropertyTable: {
        Properties: [
          { CID: 702, Title: 'Ethanol', MolecularFormula: 'C2H6O', MolecularWeight: '46.07', SMILES: 'CCO' },
          { CID: 8254, Title: 'Dimethyl Ether', MolecularFormula: 'C2H6O', MolecularWeight: 46.07, IsomericSMILES: 'COC' },
          { CID: 1, Title: 'No structure' },
        ],
      },
    }
    expect(parsePubChem(json)).toEqual([
      { cid: 702, title: 'Ethanol', formula: 'C2H6O', mw: 46.07, smiles: 'CCO' },
      { cid: 8254, title: 'Dimethyl Ether', formula: 'C2H6O', mw: 46.07, smiles: 'COC' },
    ])
  })

  it('copes with an empty or unexpected reply', () => {
    expect(parsePubChem({})).toEqual([])
  })
})

describe('searchPubChem (with a fake network)', () => {
  afterEach(() => vi.unstubAllGlobals())

  function fakeFetch(status: number, body: unknown) {
    // A fresh Response each call: a response body can only be read once.
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('uses the name endpoint for names and the formula endpoint for formulas', async () => {
    const fetch = fakeFetch(200, { PropertyTable: { Properties: [] } })
    await searchPubChem('aspirin')
    expect(fetch.mock.calls[0][0]).toContain('/compound/name/aspirin/')
    await searchPubChem('C6H12O6')
    expect(fetch.mock.calls[1][0]).toContain('/compound/fastformula/C6H12O6/')
  })

  it('returns no results (rather than an error) when PubChem says 404', async () => {
    fakeFetch(404, { Fault: { Code: 'PUGREST.NotFound' } })
    expect(await searchPubChem('notarealcompound')).toEqual([])
  })

  it('throws for server errors so the page can say so', async () => {
    fakeFetch(503, {})
    await expect(searchPubChem('aspirin')).rejects.toThrow('503')
  })
})
