import initRDKitModule, { type MainModule } from '@rdkit/rdkit'

// RDKit is a C++ chemistry toolkit compiled to WebAssembly (a .wasm file).
// The .wasm is big (~7 MB), so we load it once and share the same promise everywhere.
// `new URL(..., import.meta.url)` tells Vite to ship the .wasm file with the app.
const wasmUrl = new URL('../../node_modules/@rdkit/rdkit/dist/RDKit_minimal.wasm', import.meta.url).href

let rdkitPromise: Promise<MainModule> | null = null

export function loadRDKit(): Promise<MainModule> {
  rdkitPromise ??= initRDKitModule({ locateFile: () => wasmUrl })
  return rdkitPromise
}
