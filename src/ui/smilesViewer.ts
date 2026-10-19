import { loadRDKit } from '../chem/rdkit.ts'
import { chargeSuffix, countElements, hillFormula } from '../chem/formula.ts'

// Milestone 1: SMILES viewer.
// Type a SMILES string → see the 2D structure, molecular formula and masses.

const EXAMPLES: { name: string; smiles: string }[] = [
  { name: 'Ethanol', smiles: 'CCO' },
  { name: 'Water', smiles: 'O' },
  { name: 'Benzene', smiles: 'c1ccccc1' },
  { name: 'Aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'Caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
  { name: 'Glycine (zwitterion)', smiles: '[NH3+]CC(=O)[O-]' },
  { name: 'Sodium chloride', smiles: '[Na+].[Cl-]' },
]

/** Writes "C2H6O" with real subscripts (C₂H₆O) using safe DOM elements. */
function renderFormula(target: HTMLElement, formula: string, charge: string) {
  target.replaceChildren()
  for (const [, symbol, count] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) {
    target.append(symbol)
    if (count) {
      const sub = document.createElement('sub')
      sub.textContent = count
      target.append(sub)
    }
  }
  if (charge) {
    const sup = document.createElement('sup')
    sup.textContent = charge
    target.append(sup)
  }
}

export async function mountSmilesViewer(container: HTMLElement): Promise<void> {
  // The skeleton is fixed text, so innerHTML is safe here.
  // Anything the user types is only ever inserted with textContent (never innerHTML).
  container.innerHTML = `
    <label for="smiles">SMILES</label>
    <input id="smiles" type="text" spellcheck="false" autocomplete="off" placeholder="e.g. CCO" disabled />
    <div class="examples" id="examples"></div>
    <p class="status" id="status">Loading chemistry engine…</p>
    <section class="result" id="result" hidden>
      <img id="structure" alt="2D structure" width="360" height="280" />
      <dl>
        <dt>Molecular formula</dt><dd id="formula"></dd>
        <dt>Molecular weight</dt><dd id="mw"></dd>
        <dt>Exact mass</dt><dd id="exact"></dd>
        <dt>Canonical SMILES</dt><dd id="canonical"></dd>
      </dl>
    </section>
  `

  const input = container.querySelector<HTMLInputElement>('#smiles')!
  const examples = container.querySelector<HTMLDivElement>('#examples')!
  const status = container.querySelector<HTMLParagraphElement>('#status')!
  const result = container.querySelector<HTMLElement>('#result')!
  const structure = container.querySelector<HTMLImageElement>('#structure')!
  const formulaEl = container.querySelector<HTMLElement>('#formula')!
  const mwEl = container.querySelector<HTMLElement>('#mw')!
  const exactEl = container.querySelector<HTMLElement>('#exact')!
  const canonicalEl = container.querySelector<HTMLElement>('#canonical')!

  function showError(message: string) {
    result.hidden = true
    status.textContent = message
    status.className = 'status error'
  }

  const rdkit = await loadRDKit()
  rdkit.disable_logging() // stop RDKit printing parse errors to the console while the user is mid-typing

  function update() {
    const smiles = input.value.trim()
    if (!smiles) {
      result.hidden = true
      status.textContent = 'Type a SMILES string or pick an example.'
      status.className = 'status'
      return
    }

    const mol = rdkit.get_mol(smiles)
    if (!mol || !mol.is_valid()) {
      mol?.delete()
      showError(`“${smiles}” is not a valid SMILES string.`)
      return
    }

    try {
      const descriptors = JSON.parse(mol.get_descriptors()) as { amw: number; exactmw: number }
      const { counts, charge } = countElements(mol.get_json())

      // RDKit draws the molecule as SVG text; showing it through <img> keeps any markup inert.
      structure.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(mol.get_svg(360, 280))
      renderFormula(formulaEl, hillFormula(counts), chargeSuffix(charge))
      mwEl.textContent = `${descriptors.amw.toFixed(2)} g/mol`
      exactEl.textContent = descriptors.exactmw.toFixed(4)
      canonicalEl.textContent = mol.get_smiles()

      result.hidden = false
      status.textContent = ''
      status.className = 'status'
    } finally {
      mol.delete() // RDKit objects live in WebAssembly memory and must be freed by hand
    }
  }

  for (const example of EXAMPLES) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = example.name
    button.addEventListener('click', () => {
      input.value = example.smiles
      update()
    })
    examples.append(button)
  }

  input.addEventListener('input', update)
  input.disabled = false
  input.value = 'CCO'
  update()
}
