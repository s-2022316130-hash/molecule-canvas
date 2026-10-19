// Undo/redo by keeping snapshots of the molecule.
// Because the model never changes a molecule in place, each snapshot stays
// exactly as it was, so "undo" just means "go back to the previous snapshot".

const MAX_STEPS = 200

export class History<T> {
  private past: T[] = []
  private future: T[] = []
  private present: T

  constructor(initial: T) {
    this.present = initial
  }

  get current(): T {
    return this.present
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** Records a new state. Making a new edit after undoing throws away the redo steps. */
  push(next: T): void {
    if (next === this.present) return // nothing changed, so nothing to undo
    this.past.push(this.present)
    if (this.past.length > MAX_STEPS) this.past.shift()
    this.present = next
    this.future = []
  }

  undo(): void {
    const previous = this.past.pop()
    if (previous === undefined) return
    this.future.push(this.present)
    this.present = previous
  }

  redo(): void {
    const next = this.future.pop()
    if (next === undefined) return
    this.past.push(this.present)
    this.present = next
  }
}
