/** Writes "C2H6O" with real subscripts (C₂H₆O) using safe DOM elements. */
export function renderFormula(target: HTMLElement, formula: string, charge: string): void {
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
