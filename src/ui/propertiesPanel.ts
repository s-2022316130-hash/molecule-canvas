// The live properties strip under the drawing canvas.
// It shows the formula and masses of whatever is drawn, updating after every edit.

import type { MainModule } from '@rdkit/rdkit'
import { analyze, type Analysis } from '../chem/analyze.ts'
import { loadRDKit } from '../chem/rdkit.ts'
import type { Molecule } from '../model/molecule.ts'
import { valenceProblems } from '../model/valence.ts'
import { renderFormula } from './formulaView.ts'

const ELEMENT_NAMES: Record<string, string> = { C: 'carbon', N: 'nitrogen', O: 'oxygen', S: 'sulfur', P: 'phosphorus' }

/**
 * Builds the panel and returns the function to call whenever the molecule changes.
 * `onAnalysis` receives each RDKit result (or null when there is none), e.g. to show R/S labels.
 */
export function mountPropertiesPanel(
  container: HTMLElement,
  onAnalysis?: (analysis: Analysis | null) => void,
): (mol: Molecule) => void {
  // Fixed skeleton text only; all values are inserted with textContent.
  container.innerHTML = `
    <p class="props-message" id="props-message">Loading chemistry engine…</p>
    <dl class="props" id="props" hidden>
      <div><dt>Formula</dt><dd id="props-formula"></dd></div>
      <div><dt>Molecular weight</dt><dd id="props-mw"></dd></div>
      <div><dt>Exact mass</dt><dd id="props-exact"></dd></div>
      <div><dt>SMILES</dt><dd id="props-smiles"></dd></div>
    </dl>
  `
  const message = container.querySelector<HTMLParagraphElement>('#props-message')!
  const props = container.querySelector<HTMLElement>('#props')!
  const formulaEl = container.querySelector<HTMLElement>('#props-formula')!
  const mwEl = container.querySelector<HTMLElement>('#props-mw')!
  const exactEl = container.querySelector<HTMLElement>('#props-exact')!
  const smilesEl = container.querySelector<HTMLElement>('#props-smiles')!

  let rdkit: MainModule | null = null
  let latest: Molecule | null = null

  function showMessage(text: string, isError = false) {
    onAnalysis?.(null)
    props.hidden = true
    message.hidden = false
    message.textContent = text
    message.classList.toggle('error', isError)
  }

  function update(mol: Molecule) {
    latest = mol
    if (!rdkit) return // shown once the engine has loaded
    if (mol.atoms.length === 0) return showMessage('Draw a structure to see its formula and mass.')

    const problems = valenceProblems(mol)
    if (problems.length > 0) {
      const p = problems[0]
      const name = ELEMENT_NAMES[p.element] ?? p.element
      const more = problems.length > 1 ? ` (and ${problems.length - 1} more atom${problems.length > 2 ? 's' : ''})` : ''
      return showMessage(`Too many bonds: a ${name} atom has ${p.bonds}, but the maximum is ${p.max}${more}.`, true)
    }

    const result = analyze(rdkit, mol)
    if (!result) return showMessage('RDKit could not interpret this structure.', true)

    renderFormula(formulaEl, result.formula, result.charge)
    mwEl.textContent = `${result.mw.toFixed(2)} g/mol`
    exactEl.textContent = result.exactMass.toFixed(4)
    smilesEl.textContent = result.smiles
    message.hidden = true
    props.hidden = false
    onAnalysis?.(result)
  }

  loadRDKit().then(
    (module) => {
      rdkit = module
      rdkit.disable_logging()
      if (latest) update(latest)
    },
    () => showMessage('The chemistry engine failed to load. Try reloading the page.', true),
  )

  return update
}
