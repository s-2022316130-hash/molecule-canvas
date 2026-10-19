// The File bar above the canvas: open, save, export and copy.

import type { MainModule } from '@rdkit/rdkit'
import { analyze } from '../chem/analyze.ts'
import { importStructure } from '../chem/importer.ts'
import type { EditorApi } from '../editor/editor.ts'
import type { Annotations } from '../editor/renderer.ts'
import { toMolBlock } from '../model/molfile.ts'
import { downloadFile, moleculeToSvg, svgToPng } from './exportImage.ts'

export const CANVAS_CENTRE = { x: 360, y: 210 } // middle of the 720 × 420 canvas

interface FileBarDeps {
  editor: EditorApi
  getRdkit: () => MainModule | null
  getAnnotations: () => Annotations | undefined
}

export function mountFileBar(container: HTMLElement, { editor, getRdkit, getAnnotations }: FileBarDeps): void {
  // Fixed markup only.
  container.innerHTML = `
    <div class="file-bar" role="toolbar" aria-label="File">
      <button type="button" data-action="open" title="Open a MOL, SDF or SMILES file">Open…</button>
      <button type="button" data-action="save" title="Save as a MOL file (opens in ChemDraw, Marvin, PubChem…)">Save .mol</button>
      <button type="button" data-action="svg" title="Download a vector picture">Export SVG</button>
      <button type="button" data-action="png" title="Download a high-resolution picture">Export PNG</button>
      <button type="button" data-action="smiles" title="Copy the SMILES string">Copy SMILES</button>
      <span class="file-status" id="file-status" role="status"></span>
      <input type="file" id="file-input" accept=".mol,.sdf,.sd,.smi,.smiles,.txt" hidden />
    </div>
  `
  const status = container.querySelector<HTMLSpanElement>('#file-status')!
  const fileInput = container.querySelector<HTMLInputElement>('#file-input')!
  let statusTimer: number | undefined

  function say(text: string, isError = false) {
    status.textContent = text
    status.classList.toggle('error', isError)
    clearTimeout(statusTimer)
    statusTimer = window.setTimeout(() => (status.textContent = ''), 4000)
  }

  /** The current drawing, or null (with a message) when there's nothing to save. */
  function currentMolecule() {
    const mol = editor.getMolecule()
    if (mol.atoms.length === 0) {
      say('Draw something first.', true)
      return null
    }
    return mol
  }

  const actions: Record<string, () => void | Promise<void>> = {
    open: () => fileInput.click(),
    save: () => {
      const mol = currentMolecule()
      if (!mol) return
      downloadFile('molecule.mol', toMolBlock(mol, 'Molecule Canvas') + '\n', 'chemical/x-mdl-molfile')
      say('Saved molecule.mol')
    },
    svg: () => {
      const mol = currentMolecule()
      if (!mol) return
      downloadFile('molecule.svg', moleculeToSvg(mol, getAnnotations()), 'image/svg+xml')
      say('Exported molecule.svg')
    },
    png: async () => {
      const mol = currentMolecule()
      if (!mol) return
      downloadFile('molecule.png', await svgToPng(moleculeToSvg(mol, getAnnotations())))
      say('Exported molecule.png')
    },
    smiles: async () => {
      const mol = currentMolecule()
      const rdkit = getRdkit()
      if (!mol || !rdkit) return
      const result = analyze(rdkit, mol)
      if (!result) return say('This structure has no valid SMILES yet.', true)
      try {
        await navigator.clipboard.writeText(result.smiles)
        say(`Copied ${result.smiles}`)
      } catch {
        say('The browser blocked clipboard access.', true)
      }
    },
  }

  container.addEventListener('click', (e) => {
    const action = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')?.dataset.action
    if (action) void actions[action]()
  })

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]
    fileInput.value = '' // so choosing the same file again still triggers "change"
    const rdkit = getRdkit()
    if (!file) return
    if (!rdkit) return say('The chemistry engine is still loading. Try again in a moment.', true)
    const mol = importStructure(rdkit, await file.text(), CANVAS_CENTRE)
    if (!mol) return say(`Couldn't read a structure from ${file.name}.`, true)
    editor.setMolecule(mol)
    say(`Opened ${file.name}`)
  })
}
