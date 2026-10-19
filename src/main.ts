import './style.css'
import { mountEditor } from './editor/editor.ts'
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
    </section>
    <section aria-labelledby="smiles-heading">
      <h2 id="smiles-heading">SMILES viewer</h2>
      <div id="smiles-viewer"></div>
    </section>
  </main>
`

// The editor needs no chemistry engine, so it appears straight away;
// the viewer waits for RDKit's WebAssembly to download.
mountEditor(document.querySelector<HTMLDivElement>('#editor')!)
await mountSmilesViewer(document.querySelector<HTMLDivElement>('#smiles-viewer')!)
