import './style.css'
import type { MainModule } from '@rdkit/rdkit'
import type { Analysis } from './chem/analyze.ts'
import { importStructure } from './chem/importer.ts'
import { cleanUpLayout } from './chem/layout.ts'
import { loadRDKit } from './chem/rdkit.ts'
import { mountEditor, type EditorApi } from './editor/editor.ts'
import { fromMolBlock, toMolBlock } from './model/molfile.ts'
import type { Molecule } from './model/molecule.ts'
import { CANVAS_CENTRE, mountFileBar } from './ui/fileBar.ts'
import { mountPropertiesPanel } from './ui/propertiesPanel.ts'
import { mountSmilesViewer } from './ui/smilesViewer.ts'

// Entry point: Vite loads this file from index.html.
// The page has two parts: the drawing editor and the SMILES viewer.

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header>
    <h1>Molecule Canvas</h1>
    <p class="tagline">A browser-based chemical structure editor</p>
  </header>
  <main>
    <section aria-labelledby="draw-heading">
      <h2 id="draw-heading">Draw</h2>
      <div id="file-bar"></div>
      <div id="editor"></div>
      <div id="properties" class="properties" aria-live="polite"></div>
    </section>
    <section aria-labelledby="smiles-heading">
      <h2 id="smiles-heading">SMILES viewer</h2>
      <div id="smiles-viewer"></div>
    </section>
  </main>
`

// ---- Autosave: the drawing is kept in this browser, so a reload doesn't lose it. ----
const AUTOSAVE_KEY = 'molecule-canvas:autosave'

function loadAutosave(): Molecule | undefined {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY)
    return saved ? fromMolBlock(saved) : undefined
  } catch {
    return undefined // storage blocked (private window) or an unreadable save: start empty
  }
}

function autosave(mol: Molecule) {
  try {
    if (mol.atoms.length) localStorage.setItem(AUTOSAVE_KEY, toMolBlock(mol))
    else localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    // Saving is a convenience; if the browser refuses, the editor still works.
  }
}

// ---- Wiring ----
let rdkit: MainModule | null = null
let editor: EditorApi | null = null
let lastAnalysis: Analysis | null = null

const stereoLabels = () => (lastAnalysis ? { atoms: lastAnalysis.atomStereo, bonds: lastAnalysis.bondStereo } : undefined)

// Each RDKit analysis also feeds the R/S and E/Z labels drawn on the canvas.
const updateProperties = mountPropertiesPanel(document.querySelector<HTMLDivElement>('#properties')!, (analysis) => {
  lastAnalysis = analysis
  editor?.setAnnotations(stereoLabels())
})

// The editor needs no chemistry engine, so it appears straight away;
// the panel, Clean up and file import start working once RDKit has downloaded.
editor = mountEditor(document.querySelector<HTMLDivElement>('#editor')!, {
  initial: loadAutosave(),
  onChange: (mol) => {
    updateProperties(mol)
    autosave(mol)
  },
  cleanUp: (mol) => (rdkit ? cleanUpLayout(rdkit, mol) : null),
})

mountFileBar(document.querySelector<HTMLDivElement>('#file-bar')!, {
  editor,
  getRdkit: () => rdkit,
  getAnnotations: stereoLabels,
})

rdkit = await loadRDKit()
await mountSmilesViewer(document.querySelector<HTMLDivElement>('#smiles-viewer')!, (smiles) => {
  const mol = rdkit && importStructure(rdkit, smiles, CANVAS_CENTRE)
  if (mol) {
    editor?.setMolecule(mol)
    document.querySelector('#draw-heading')?.scrollIntoView({ behavior: 'smooth' })
  }
})
