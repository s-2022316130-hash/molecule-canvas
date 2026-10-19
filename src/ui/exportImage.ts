// Exports the drawing as an SVG or PNG picture.
//
// We reuse the same renderer as the canvas, then crop to the molecule and
// embed a small stylesheet, because a saved .svg file can't see our page's CSS.

import type { Molecule } from '../model/molecule.ts'
import { render, type Annotations } from '../editor/renderer.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const MARGIN = 28 // room around the atoms for labels like "OH" and "(R)"

// Fixed light colours: exported pictures usually end up on white paper or slides.
const EXPORT_CSS = `
  .bond-line { stroke: #1d2330; stroke-width: 1.6; stroke-linecap: round; }
  .bond-line.hash { stroke-width: 1.2; }
  .bond-wedge { fill: #1d2330; stroke: #1d2330; stroke-width: 0.8; stroke-linejoin: round; }
  .atom-halo { fill: none; }
  .atom-label { font: 600 15px Arial, Helvetica, sans-serif; fill: #1d2330; text-anchor: middle; dominant-baseline: central; }
  .atom-label.h-right { text-anchor: start; }
  .atom-label.h-left { text-anchor: end; }
  .h-count { font-size: 11px; }
  .atom-charge { font: 600 10px Arial, Helvetica, sans-serif; fill: #1d2330; text-anchor: middle; dominant-baseline: central; }
  .stereo-label { font: italic 600 10px Arial, Helvetica, sans-serif; fill: #1f7a5a; text-anchor: middle; dominant-baseline: central; }
  .stereo-label.unknown { fill: #5b6475; }
  .element-N { fill: #2f5fd0; } .element-O { fill: #d0312d; } .element-S { fill: #b8860b; }
  .element-F, .element-Cl { fill: #1e9e4a; } .element-Br { fill: #a23b1b; } .element-I { fill: #7b2fa0; }
`

/** Builds a standalone SVG document (as text) of the molecule, cropped to fit. */
export function moleculeToSvg(mol: Molecule, annotations?: Annotations): string {
  const svg = document.createElementNS(SVG_NS, 'svg')
  render(svg, mol, { annotations })

  const xs = mol.atoms.map((a) => a.x)
  const ys = mol.atoms.map((a) => a.y)
  const left = Math.min(...xs) - MARGIN
  const top = Math.min(...ys) - MARGIN
  const width = Math.max(...xs) - Math.min(...xs) + 2 * MARGIN
  const height = Math.max(...ys) - Math.min(...ys) + 2 * MARGIN

  svg.setAttribute('xmlns', SVG_NS)
  svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`)
  svg.setAttribute('width', String(Math.round(width)))
  svg.setAttribute('height', String(Math.round(height)))

  const style = document.createElementNS(SVG_NS, 'style')
  style.textContent = EXPORT_CSS
  const background = document.createElementNS(SVG_NS, 'rect')
  for (const [k, v] of Object.entries({ x: left, y: top, width, height, fill: '#ffffff' })) background.setAttribute(k, String(v))
  svg.prepend(style, background)

  return new XMLSerializer().serializeToString(svg)
}

/** Draws SVG text onto a canvas and returns a PNG, `scale` times the SVG's size for crisp print. */
export function svgToPng(svgText: string, scale = 3): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(image.width * scale)
      canvas.height = Math.ceil(image.height * scale)
      const context = canvas.getContext('2d')!
      context.scale(scale, scale)
      context.drawImage(image, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not draw the SVG'))
    }
    image.src = url
  })
}

/** Offers a file to the user through the browser's normal download. */
export function downloadFile(filename: string, contents: Blob | string, type = 'text/plain'): void {
  const blob = typeof contents === 'string' ? new Blob([contents], { type }) : contents
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
