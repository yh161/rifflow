/**
 * _markdown_insert.ts
 *
 * Shared singleton for the active markdown textarea.
 * text.tsx registers the textarea on focus; TextFormatBar reads it.
 */

export let activeTextarea: HTMLTextAreaElement | null = null

export function registerTextarea(el: HTMLTextAreaElement | null) {
  activeTextarea = el
}

/**
 * Insert markdown syntax around the current selection (or at cursor).
 *
 * @param prefix  — inserted before selection, e.g. "**"
 * @param suffix  — inserted after selection, e.g. "**"  (omit for line prefixes)
 * @param linePrefix — if true, prefix is prepended to the start of the current line
 */
export function insertMarkdown(prefix: string, suffix = '', linePrefix = false) {
  const el = activeTextarea
  if (!el) return

  const start    = el.selectionStart
  const end      = el.selectionEnd
  const value    = el.value
  const selected = value.slice(start, end)

  let newValue: string
  let newStart:  number
  let newEnd:    number

  if (linePrefix) {
    // For headings / quote / list — prepend to the line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    newStart = start + prefix.length
    newEnd   = end   + prefix.length
  } else {
    // Inline: wrap selection (or place cursor between markers)
    newValue = value.slice(0, start) + prefix + selected + suffix + value.slice(end)
    newStart = start + prefix.length
    newEnd   = start + prefix.length + selected.length
  }

  // Trigger React's synthetic onChange via native setter
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  nativeSetter?.call(el, newValue)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.focus()
  el.setSelectionRange(newStart, newEnd)
}
