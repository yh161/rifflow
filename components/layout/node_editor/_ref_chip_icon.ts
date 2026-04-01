export function getRefChipIconSvgInner(type: string): string {
  switch (type) {
    case 'text':
      return '<line x1="21" x2="3" y1="6" y2="6" stroke-linecap="round"/><line x1="15" x2="3" y1="12" y2="12" stroke-linecap="round"/><line x1="17" x2="3" y1="18" y2="18" stroke-linecap="round"/>'
    case 'image':
      return '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'
    case 'video':
      return '<path d="m22 8-6 4 6 4V8z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/>'
    case 'pdf':
      return '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h6"/><path d="M8 9h1"/>'
    case 'filter':
      return '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>'
    case 'seed':
      return '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>'
    case 'template':
      return '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m6.08 9.5-3.5 1.6a1 1 0 0 0 0 1.81l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9a1 1 0 0 0 0-1.83l-3.5-1.59"/>'
    default:
      return '<line x1="21" x2="3" y1="6" y2="6" stroke-linecap="round"/><line x1="15" x2="3" y1="12" y2="12" stroke-linecap="round"/>'
  }
}

export function getRefChipIconDataUri(type: string, color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${getRefChipIconSvgInner(type)}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
