import './style.css'

// Entry point: Vite loads this file from index.html.
// For now it only proves the toolchain works; Milestone 1 (SMILES viewer) builds on it.

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header>
    <h1>Molecule Canvas</h1>
    <p class="tagline">A browser-based chemical structure editor</p>
  </header>
  <main>
    <p class="status">Setup complete: Vite + TypeScript are running.</p>
    <p class="hint">Edit <code>src/main.ts</code> and save; this page updates instantly.</p>
  </main>
`
