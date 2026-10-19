// "Find a structure": type a name or a molecular formula, get structures from PubChem.

import { looksLikeFormula, searchPubChem, type Candidate } from '../chem/lookup.ts'
import { renderFormula } from './formulaView.ts'

/**
 * `onDraw` puts a candidate on the canvas and returns false if it couldn't
 * (e.g. the chemistry engine is still loading).
 */
export function mountSearchPanel(container: HTMLElement, onDraw: (candidate: Candidate) => boolean): void {
  // Fixed markup only; results are added with textContent.
  container.innerHTML = `
    <form class="search-form" id="search-form" role="search">
      <input id="search-input" type="search" spellcheck="false" autocomplete="off"
        placeholder="e.g. aspirin, caffeine, 2-methylpropan-1-ol, or a formula like C6H12O6" aria-label="Name or formula" />
      <button type="submit">Search</button>
    </form>
    <p class="search-note">Searches PubChem (NIH). Names give the matching compound; a formula lists isomers to choose from.</p>
    <p class="search-status" id="search-status" role="status"></p>
    <ul class="search-results" id="search-results"></ul>
  `
  const form = container.querySelector<HTMLFormElement>('#search-form')!
  const input = container.querySelector<HTMLInputElement>('#search-input')!
  const status = container.querySelector<HTMLParagraphElement>('#search-status')!
  const results = container.querySelector<HTMLUListElement>('#search-results')!
  let inFlight: AbortController | null = null

  function setStatus(text: string, isError = false) {
    status.textContent = text
    status.classList.toggle('error', isError)
  }

  function draw(candidate: Candidate) {
    if (onDraw(candidate)) setStatus(`Drew ${candidate.title}.`)
    else setStatus('The chemistry engine is still loading. Try again in a moment.', true)
  }

  function showResults(candidates: Candidate[]) {
    results.replaceChildren(
      ...candidates.map((candidate) => {
        const item = document.createElement('li')
        const name = document.createElement('span')
        name.className = 'result-name'
        name.textContent = candidate.title
        const formula = document.createElement('span')
        formula.className = 'result-formula'
        const [, plain = candidate.formula, charge = ''] = /^(.*?)([+-]\d*|\d*[+-])?$/.exec(candidate.formula) ?? []
        renderFormula(formula, plain, charge)
        const mass = document.createElement('span')
        mass.className = 'result-mw'
        mass.textContent = Number.isFinite(candidate.mw) ? `${candidate.mw.toFixed(2)} g/mol` : ''
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = 'Draw'
        button.addEventListener('click', () => draw(candidate))
        item.append(name, formula, mass, button)
        return item
      }),
    )
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const query = input.value.trim()
    if (!query) return
    inFlight?.abort() // a newer search replaces an older one still waiting
    const controller = new AbortController()
    inFlight = controller
    results.replaceChildren()
    setStatus(`Searching PubChem for “${query}”…`)

    try {
      const candidates = await searchPubChem(query, controller.signal)
      if (controller.signal.aborted) return
      if (candidates.length === 0) {
        return setStatus(`No compound found for “${query}”. Check the spelling, or try a common name.`, true)
      }
      showResults(candidates)
      if (candidates.length === 1 && !looksLikeFormula(query)) draw(candidates[0]) // a name: draw it straight away
      else setStatus(`${candidates.length} compound${candidates.length === 1 ? '' : 's'} found. Pick one to draw.`)
    } catch (error) {
      if (controller.signal.aborted) return
      setStatus(`Couldn't reach PubChem (${(error as Error).message}). Check your internet connection.`, true)
    }
  })
}
