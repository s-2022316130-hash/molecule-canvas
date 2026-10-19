import './style.css'
import type { MainModule } from '@rdkit/rdkit'
import { cleanUpLayout } from './chem/layout.ts'
import { loadRDKit } from './chem/rdkit.ts'
import { mountEditor } from './editor/editor.ts'
import { mountPropertiesPanel } from './ui/propertiesPanel.ts'
import { mountSmilesViewer } from './ui/smilesViewer.ts'

// Entry point: Vite loads this file from index.html.
// The page has two parts: the drawing editor (Phase 2) and the SMILES viewer (Milestone 1).

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <header>
    <h1>Molecule Canvas</h1>
    <p class="tagline">A browser-based chemical structure editor</p>
  </header>
  <main>
    <section aria-labelledby="draw-heading">
      <h2 id="draw-heading">Draw</h2>
      <div id="editor"></div>
      <div id="properties" class="properties" aria-live="polite"></div>
    </section>
    <section aria-labelledby="smiles-heading">
      <h2 id="smiles-heading">SMILES viewer</h2>
      <div id="smiles-viewer"></div>
    </section>
  </main>
`

// The editor needs no chemistry engine, so it appears straight away;
// the properties panel and viewer fill in once RDKit's WebAssembly has downloaded.
let rdkit: MainModule | null = null
loadRDKit().then((module) => (rdkit = module))

const updateProperties = mountPropertiesPanel(document.querySelector<HTMLDivElement>('#properties')!)
mountEditor(document.querySelector<HTMLDivElement>('#editor')!, {
  onChange: updateProperties,
  cleanUp: (mol) => (rdkit ? cleanUpLayout(rdkit, mol) : null),
})
await mountSmilesViewer(document.querySelector<HTMLDivElement>('#smiles-viewer')!)
