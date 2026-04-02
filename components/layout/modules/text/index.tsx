"use client"

import React, { memo, useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { NodeProps } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { cn } from '@/lib/utils'
import { AlignLeft } from 'lucide-react'
import type { CustomNodeData, ModuleModalProps } from '../_types'
import type { HandleDef } from '../_handle'
import { GenerateTextPanel } from '@/components/layout/node_editor/_panels'
import { registerTextarea } from '../_markdown_insert'

let lineIdSeed = 0
const makeLineId = () => lineIdSeed++

export const meta = {
  id: 'text',
  name: 'Text',
  description: 'Documentation & notes',
  icon: AlignLeft,
  color: 'text-blue-500',
  bg: 'bg-blue-50',
  border: 'hover:border-blue-200',
  opensEditor: true,
  panelTitle: 'Generate Text',
  category: 'Assets',
  modelBadge: 'Gemini',
  doneColor: 'rgba(96, 165, 250, 0.55)',
}

export const defaultData: Partial<CustomNodeData> = {
  type: 'text',
  label: 'Text',
  content: '',
  align: 'left',
}

export const handles: HandleDef[] = [
  { id: 'in',  side: 'left'  },
  { id: 'out', side: 'right' },
]

// ── Memoized markdown renderer — skips re-parse when text is unchanged ─────────
const MemoMarkdown = memo(function MemoMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {text}
    </ReactMarkdown>
  )
})

// ── Shared markdown prose classes ──────────────────────────────────────────────
const mdClasses = cn(
  "text-xs text-slate-600 leading-relaxed",
  "[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-1 [&_h1]:text-slate-800",
  "[&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mt-0.5 [&_h2]:mb-0.5 [&_h2]:text-slate-800",
  "[&_h3]:text-xs [&_h3]:font-medium [&_h3]:mt-0.5 [&_h3]:mb-0 [&_h3]:text-slate-700",
  "[&_p]:my-0.5 [&_p]:leading-relaxed",
  "[&_ul]:my-0.5 [&_ul]:pl-4 [&_ul]:list-disc [&_li]:my-0",
  "[&_ol]:my-0.5 [&_ol]:pl-4 [&_ol]:list-decimal",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-2 [&_blockquote]:text-slate-500 [&_blockquote]:my-0.5 [&_blockquote]:italic",
  "[&_code]:bg-slate-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[10px] [&_code]:font-mono [&_code]:text-slate-600",
  "[&_pre]:bg-slate-100 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-0.5 [&_pre_code]:bg-transparent [&_pre_code]:px-0",
  "[&_strong]:font-semibold [&_em]:italic",
  "[&_a]:text-blue-500 [&_a]:underline",
  "[&_hr]:border-slate-200 [&_hr]:my-1",
  "[&_li_p]:my-0",
)

// ── Line type for stable keys ──────────────────────────────────────────────────
interface Line { id: number; text: string }

// ── Unified hybrid markdown renderer ─────────────────────────────────────────
// One component for both display and editing — no separate "view mode".
// editable=false: all lines rendered as markdown, no interaction.
// editable=true:  active line is a textarea, others rendered as markdown.
const HybridEditor = memo(function HybridEditor({
  initialContent,
  onChange,
  onActiveElement,
  editable = true,
}: {
  initialContent: string
  onChange: (content: string) => void
  onActiveElement?: (el: HTMLElement | null) => void
  editable?: boolean
}) {
  const [lines, setLines] = useState<Line[]>(() => {
    const texts = (initialContent || '').split('\n')
    return (texts.length === 0 ? [''] : texts).map(t => ({ id: makeLineId(), text: t }))
  })
  // No line active initially — user clicks to choose where to edit
  const [activeIdx, setActiveIdx] = useState(-1)

  const linesRef = useRef(lines)
  useEffect(() => {
    linesRef.current = lines
  }, [lines])
  const inputRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map())
  const cursorPosRef = useRef<number | null>(null)

  // Sync external content changes without forcing remounts.
  useEffect(() => {
    const nextTexts = (initialContent || '').split('\n')
    const normalized = (nextTexts.length === 0 ? [''] : nextTexts)
    const current = linesRef.current.map(l => l.text)
    if (current.length === normalized.length && current.every((t, i) => t === normalized[i])) return

    const rebuilt = normalized.map((t, i) => ({
      id: linesRef.current[i]?.id ?? makeLineId(),
      text: t,
    }))
    linesRef.current = rebuilt
    setLines(rebuilt)
    setActiveIdx(idx => Math.min(idx, rebuilt.length - 1))
  }, [initialContent])

  // Focus the active textarea and restore cursor position
  useEffect(() => {
    if (activeIdx < 0) return
    const el = inputRefs.current.get(activeIdx)
    if (!el) return
    el.focus()
    if (cursorPosRef.current !== null) {
      el.setSelectionRange(cursorPosRef.current, cursorPosRef.current)
      cursorPosRef.current = null
    } else {
      el.setSelectionRange(el.value.length, el.value.length)
    }
    registerTextarea(el)
    onActiveElement?.(el)
    return () => registerTextarea(null)
  }, [activeIdx, lines.length, onActiveElement])

  // Auto-resize a textarea to fit its content (single logical line, may wrap)
  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [])

  const sync = useCallback((newLines: Line[]) => {
    linesRef.current = newLines
    setLines(newLines)
    onChange(newLines.map(l => l.text).join('\n'))
  }, [onChange])

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    const pos = ta.selectionStart ?? 0
    const cur = linesRef.current

    if (e.key === 'Enter') {
      e.preventDefault()
      const before = ta.value.slice(0, pos)
      const after = ta.value.slice(pos)
      const next = [...cur]
      next[index] = { ...next[index], text: before }
      next.splice(index + 1, 0, { id: makeLineId(), text: after })
      cursorPosRef.current = 0
      setActiveIdx(index + 1)
      sync(next)
    } else if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault()
      const next = [...cur]
      next[index] = { ...next[index], text: ta.value }
      setActiveIdx(index - 1)
      sync(next)
    } else if (e.key === 'ArrowDown' && index < cur.length - 1) {
      e.preventDefault()
      const next = [...cur]
      next[index] = { ...next[index], text: ta.value }
      setActiveIdx(index + 1)
      sync(next)
    } else if (e.key === 'Backspace' && pos === 0 && ta.selectionEnd === 0 && index > 0) {
      e.preventDefault()
      const next = [...cur]
      const prevLen = next[index - 1].text.length
      next[index - 1] = { ...next[index - 1], text: next[index - 1].text + ta.value }
      next.splice(index, 1)
      cursorPosRef.current = prevLen
      setActiveIdx(index - 1)
      sync(next)
    } else if (e.key === 'Delete' && pos === ta.value.length && index < cur.length - 1) {
      e.preventDefault()
      const next = [...cur]
      next[index] = { ...next[index], text: ta.value + next[index + 1].text }
      next.splice(index + 1, 1)
      cursorPosRef.current = pos
      sync(next)
    }
  }, [sync])

  const handleInput = useCallback((index: number, e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    autoResize(ta)
    const next = [...linesRef.current]
    next[index] = { ...next[index], text: ta.value }
    sync(next)
  }, [autoResize, sync])

  // Handle multi-line paste: split into separate lines
  const handlePaste = useCallback((index: number, e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    if (!text.includes('\n')) return
    e.preventDefault()
    const ta = e.currentTarget
    const pos = ta.selectionStart ?? 0
    const end = ta.selectionEnd ?? pos
    const before = ta.value.slice(0, pos)
    const after = ta.value.slice(end)
    const pasted = text.split('\n')
    const cur = linesRef.current
    const insertions: Line[] = pasted.map((t, i) => ({
      id: i === 0 ? cur[index].id : makeLineId(),
      text: i === 0 ? before + t : i === pasted.length - 1 ? t + after : t,
    }))
    const next = [...cur]
    next.splice(index, 1, ...insertions)
    const newIdx = index + pasted.length - 1
    cursorPosRef.current = pasted[pasted.length - 1].length
    setActiveIdx(newIdx)
    sync(next)
  }, [sync])

  // WYSIWYG hint for the active line: once markdown rule is formed,
  // immediately apply corresponding typography while typing.
  const getEditingTypographyClass = useCallback((text: string) => {
    // headings (check longer prefix first)
    if (/^###\s/.test(text)) return 'text-xs font-medium text-slate-700 leading-snug'
    if (/^##\s/.test(text)) return 'text-xs font-semibold text-slate-800 leading-snug'
    if (/^#\s/.test(text)) return 'text-sm font-bold text-slate-800 leading-snug'

    // quote
    if (/^>\s/.test(text)) return 'text-xs italic text-slate-500 leading-relaxed border-l-2 border-slate-300 pl-2'

    // task list / unordered list / ordered list
    if (/^\s*[-*+]\s\[[ xX]\]\s/.test(text)) return 'text-xs text-slate-700 leading-relaxed'
    if (/^\s*[-*+]\s/.test(text)) return 'text-xs text-slate-700 leading-relaxed'
    if (/^\s*\d+\.\s/.test(text)) return 'text-xs text-slate-700 leading-relaxed'

    // fenced code / inline-code-like typing
    if (/^```/.test(text) || /^\s{4,}\S/.test(text) || /`[^`]*`/.test(text)) {
      return 'text-[10px] font-mono text-slate-600 leading-relaxed'
    }

    // table-ish row
    if (/^\|.*\|\s*$/.test(text)) return 'text-xs text-slate-700 leading-relaxed font-medium'

    // horizontal rule typing
    if (/^\s*((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})\s*$/.test(text)) {
      return 'text-xs text-slate-400 leading-relaxed tracking-widest'
    }

    // math-ish typing (inline or block delimiters)
    if (/\$[^$]*\$/.test(text) || /^\$\$/.test(text) || /\$\$$/.test(text)) {
      return 'text-xs text-slate-700 leading-relaxed'
    }

    return 'text-xs text-slate-600 leading-relaxed'
  }, [])

  // ── Build segments: group consecutive non-active lines into chunks ──────
  type Segment =
    | { kind: 'md';    lines: Line[]; startIdx: number }
    | { kind: 'blank'; lines: Line[]; startIdx: number }
    | { kind: 'edit';  line:  Line;   idx: number }

  const segments = useMemo(() => {
    const segs: Segment[] = []
    let buf: Line[] = []
    let bufKind: 'md' | 'blank' | null = null
    let bufStart = 0

    const flush = () => {
      if (buf.length > 0 && bufKind) {
        segs.push({ kind: bufKind, lines: [...buf], startIdx: bufStart })
        buf = []
        bufKind = null
      }
    }

    lines.forEach((line, i) => {
      if (editable && i === activeIdx) {
        flush()
        segs.push({ kind: 'edit', line, idx: i })
        return
      }
      const k = line.text.trim() === '' ? 'blank' : 'md'
      if (k !== bufKind) { flush(); bufStart = i; bufKind = k }
      if (buf.length === 0) { bufStart = i; bufKind = k }
      buf.push(line)
    })
    flush()
    return segs
  }, [lines, activeIdx, editable])

  return (
    <>
      {segments.map(seg => {
        if (seg.kind === 'edit') {
          return (
            <textarea
              key={seg.line.id}
              ref={el => {
                if (el) { inputRefs.current.set(seg.idx, el); autoResize(el) }
                else inputRefs.current.delete(seg.idx)
              }}
              value={seg.line.text}
              rows={1}
              onKeyDown={e => handleKeyDown(seg.idx, e)}
              onChange={e => handleInput(seg.idx, e)}
              onPaste={e => handlePaste(seg.idx, e)}
              className={cn(
                "nodrag nopan nowheel",
                "w-full outline-none bg-transparent resize-none overflow-hidden",
                "font-inherit block px-0",
                getEditingTypographyClass(seg.line.text),
                "placeholder:text-slate-300",
              )}
              placeholder={seg.idx === 0 && lines.length === 1 ? "Write markdown here…" : undefined}
              style={{ minHeight: '1.5em' }}
            />
          )
        }

        // ── Blank segment — visible spacers ──
        if (seg.kind === 'blank') {
          return (
            <div key={seg.lines[0].id} className={editable ? "cursor-text" : undefined}>
              {seg.lines.map(l => (
                <div
                  key={l.id}
                  className="h-[1.5em]"
                  onClick={editable ? () => setActiveIdx(seg.startIdx + seg.lines.indexOf(l)) : undefined}
                />
              ))}
            </div>
          )
        }

        // ── Rendered markdown segment ──
        // Join with \n\n so each source line is an independent block.
        const text = seg.lines.map(l => l.text).join('\n\n')
        return (
          <div
            key={seg.lines[0].id}
            onClick={editable ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const ratio = (e.clientY - rect.top) / rect.height
              const offset = Math.min(
                Math.floor(ratio * seg.lines.length),
                seg.lines.length - 1,
              )
              setActiveIdx(seg.startIdx + Math.max(0, offset))
            } : undefined}
            className={cn(editable && "cursor-text", mdClasses)}
          >
            <MemoMarkdown text={text} />
          </div>
        )
      })}
    </>
  )
})

// ── Node UI ────────────────────────────────────────────────────────────────────
export const NodeUI = ({
  data,
  selected,
}: {
  data: CustomNodeData
  selected?: boolean
}) => {
  const onChange = (content: string) => data.onDataChange?.({ content })
  const isSelected = !!selected
  const isEditing  = !!data.isEditing

  const containerRef  = useRef<HTMLDivElement>(null)
  const contentRef    = useRef<HTMLDivElement>(null)
  const trackRef      = useRef<HTMLDivElement>(null)
  const thumbRef      = useRef<HTMLDivElement>(null)
  const scrollTopRef  = useRef(0)
  const maxScrollRef  = useRef(0)
  const hideTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const nativeModeRef = useRef(false)

  const syncThumb = useCallback(() => {
    const box = containerRef.current
    const el = contentRef.current
    const track = trackRef.current
    const thumb = thumbRef.current
    if (!box || !el || !track || !thumb) return

    const cH = box.clientHeight
    const eH = el.offsetHeight
    if (eH <= cH) {
      track.style.display = 'none'
      return
    }

    track.style.display = 'block'
    const tH = Math.max(16, (cH / eH) * cH)
    const top = maxScrollRef.current > 0
      ? (scrollTopRef.current / maxScrollRef.current) * (cH - tH)
      : 0
    thumb.style.height = `${tH}px`
    thumb.style.transform = `translateY(${top}px)`
  }, [])

  const applyManualTransform = useCallback(() => {
    if (!contentRef.current) return
    contentRef.current.style.transform = `translateY(-${scrollTopRef.current}px)`
  }, [])

  const enterNativeMode = useCallback(() => {
    const box = containerRef.current
    const content = contentRef.current
    if (!box || !content || nativeModeRef.current) return

    nativeModeRef.current = true
    content.style.transform = 'translateY(0px)'
    box.style.overflowY = 'auto'
    box.scrollTop = scrollTopRef.current
  }, [])

  const showTrack = useCallback(() => {
    if (!trackRef.current || maxScrollRef.current <= 0) return
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    trackRef.current.style.opacity = '1'
  }, [])

  const scheduleHideTrack = useCallback(() => {
    if (nativeModeRef.current) return
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (trackRef.current) trackRef.current.style.opacity = '0'
    }, 900)
  }, [])

  const leaveNativeMode = useCallback(() => {
    const box = containerRef.current
    const content = contentRef.current
    if (!box || !content || !nativeModeRef.current) return

    scrollTopRef.current = box.scrollTop
    nativeModeRef.current = false
    box.style.overflowY = 'hidden'
    box.scrollTop = 0
    applyManualTransform()
    syncThumb()
    scheduleHideTrack()
  }, [applyManualTransform, syncThumb, scheduleHideTrack])

  const scheduleLeaveNativeMode = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => leaveNativeMode(), 140)
  }, [leaveNativeMode])

  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }, [])

  useEffect(() => {
    const box = containerRef.current
    const el = contentRef.current
    if (!box || !el) return

    const update = () => {
      const max = Math.max(0, el.offsetHeight - box.clientHeight)
      maxScrollRef.current = max
      scrollTopRef.current = Math.max(0, Math.min(scrollTopRef.current, max))

      if (nativeModeRef.current) box.scrollTop = scrollTopRef.current
      else applyManualTransform()

      syncThumb()
    }

    const ro = new ResizeObserver(update)
    ro.observe(box)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  }, [applyManualTransform, syncThumb, data.content])

  useEffect(() => {
    const box = containerRef.current
    if (!box || !selected) return

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      e.preventDefault()
      e.stopPropagation()

      enterNativeMode()
      const next = Math.max(0, Math.min(maxScrollRef.current, box.scrollTop + e.deltaY))
      box.scrollTop = next
      scrollTopRef.current = next

      syncThumb()
      showTrack()
      scheduleLeaveNativeMode()
    }

    const onScroll = () => {
      if (!nativeModeRef.current) return
      scrollTopRef.current = box.scrollTop
      syncThumb()
      showTrack()
      scheduleLeaveNativeMode()
    }

    box.addEventListener('wheel', onWheel, { passive: false })
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      box.removeEventListener('wheel', onWheel)
      box.removeEventListener('scroll', onScroll)
    }
  }, [selected, enterNativeMode, syncThumb, showTrack, scheduleLeaveNativeMode])

  useEffect(() => {
    if (!selected) return
    showTrack()
    scheduleHideTrack()
  }, [selected, showTrack, scheduleHideTrack])

  // Scroll-into-view helper — called by HybridEditor when active line changes
  const scrollIntoView = useCallback((el: HTMLElement | null) => {
    const box = containerRef.current
    if (!el || !box) return

    if (nativeModeRef.current) {
      el.scrollIntoView({ block: 'nearest' })
      scrollTopRef.current = box.scrollTop
    } else {
      const cH = box.clientHeight
      const top = el.offsetTop
      const bottom = top + el.offsetHeight
      let s = scrollTopRef.current
      if (top < s) s = top
      else if (bottom > s + cH) s = bottom - cH
      s = Math.max(0, Math.min(maxScrollRef.current, s))
      if (s !== scrollTopRef.current) {
        scrollTopRef.current = s
        applyManualTransform()
      }
    }

    syncThumb()
    showTrack()
    scheduleHideTrack()
  }, [applyManualTransform, syncThumb, showTrack, scheduleHideTrack])

  const w = data.width  ?? 180
  const h = data.height ?? 180

  const panelStyle: React.CSSProperties = {
    width: w,
    height: h,
    borderRadius: 14,
    borderColor: isSelected || isEditing
      ? 'rgba(59,130,246,0.62)'
      : data.mode === 'done'
        ? 'rgba(59,130,246,0.52)'
        : 'rgba(100,116,139,0.36)',
    boxShadow: isSelected
      ? '0 6px 16px rgba(15,23,42,0.10), 0 0 0 1px rgba(59,130,246,0.20), 0 0 10px rgba(56,189,248,0.14)'
      : 'none',
    transition: 'box-shadow 180ms ease, border-color 180ms ease',
  }

  return (
    <div
      className={cn(
        "rounded-[14px]",
        "bg-white/70 border",
        "p-3 flex flex-col overflow-hidden",
      )}
      style={panelStyle}
    >
      <div className="flex-1 overflow-hidden text-xs text-slate-600 leading-relaxed min-h-0">
        {(data.isEditing || data.content) ? (
          <div className="h-full relative">
            <div
              ref={containerRef}
              className="h-full overflow-hidden relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
            >
              <div
                ref={contentRef}
                className={cn(mdClasses, "pr-2", data.isEditing && "nodrag nopan")}
              >
                {/* Single renderer for both display and editing.
                    key forces remount when toggling so lines re-init from content. */}
                <HybridEditor
                  initialContent={data.content ?? ''}
                  onChange={onChange}
                  onActiveElement={scrollIntoView}
                  editable={!!data.isEditing && !!selected}
                />
              </div>
            </div>

            {/* Keep custom scrollbar OUTSIDE scroll container so native-mode
                overflow scrolling doesn't move/hide it while wheel-scrolling. */}
            <div
              ref={trackRef}
              style={{
                display: 'none',
                opacity: 0,
                transition: 'opacity 180ms ease',
                position: 'absolute',
                right: -1,
                top: 3,
                bottom: 3,
                width: 3,
                pointerEvents: 'none',
                zIndex: 10,
              }}
            >
              <div
                ref={thumbRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  width: '100%',
                  minHeight: 16,
                  borderRadius: 99,
                  background: 'rgba(148,163,184,0.45)',
                }}
              />
            </div>
          </div>
        ) : (
          <span className="italic text-slate-300 text-[11px]">
            Double-click to edit…
          </span>
        )}
      </div>
    </div>
  )
}

export const ReactFlowNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => (
  <NodeUI data={data} selected={selected} />
))
ReactFlowNode.displayName = 'TextNode'

export function ModalContent({ data, nodeId, onUpdate, mode = 'auto', isGenerating = false, onGenerate, onStop }: ModuleModalProps) {
  return (
    <GenerateTextPanel
      data={data as CustomNodeData}
      nodeId={nodeId}
      onDataChange={onUpdate as (u: Partial<CustomNodeData>) => void}
      mode={mode}
      isGenerating={isGenerating}
      onGenerate={onGenerate ?? (() => {})}
      onStop={onStop ?? (() => {})}
    />
  )
}
export { resultHandler } from './resultHandler'
export { ActionBarContent } from './actionBar'
