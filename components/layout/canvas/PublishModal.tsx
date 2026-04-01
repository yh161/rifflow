"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
  Camera, Tag, ChevronRight, Loader2,
  ImageIcon, Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label }    from "@/components/ui/label"
import { Badge }    from "@/components/ui/badge"

// ── 封面上传 ──────────────────────────────────────────────────────────
function CoverUpload({
  preview, onFile,
}: {
  preview: string | null
  onFile: (file: File, url: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    onFile(file, url)
  }, [onFile])

  return (
    <div
      onClick={() => ref.current?.click()}
      className={cn(
        "group relative w-full aspect-square rounded-2xl border-2 border-dashed",
        "flex flex-col items-center justify-center cursor-pointer",
        "overflow-hidden transition-colors duration-150",
        preview
          ? "border-transparent"
          : "border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100/80",
      )}
    >
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="cover" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <Camera className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </>
      ) : (
        <>
          <ImageIcon className="h-8 w-8 text-slate-300 mb-2" />
          <span className="text-xs text-slate-400">上传封面图</span>
          <span className="text-[10px] text-slate-300 mt-0.5">推荐 1:1 比例</span>
        </>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}

// ── AI 封面生成 ────────────────────────────────────────────────────────
function AICoverGen({
  onGenerated,
}: {
  onGenerated: (previewUrl: string, file: File) => void
}) {
  const [prompt,     setPrompt]     = useState("")
  const [generating, setGen]        = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const generate = async () => {
    if (generating || !prompt.trim()) return
    setGen(true)
    setError(null)
    try {
      const res = await fetch("/api/cover/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "生成失败")
      }
      const { url } = await res.json()
      // Convert data URL (base64) or remote URL to a File blob
      let blob: Blob
      if (url.startsWith("data:")) {
        const [header, b64] = url.split(",")
        const mime = header.replace("data:", "").replace(";base64", "") || "image/png"
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
        blob = new Blob([bytes], { type: mime })
      } else {
        const imgRes = await fetch(url)
        blob = await imgRes.blob()
      }
      const file = new File([blob], "ai-cover.png", { type: blob.type || "image/png" })
      const previewUrl = URL.createObjectURL(blob)
      onGenerated(previewUrl, file)
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setGen(false)
    }
  }

  return (
    <div className="space-y-2 pt-3 border-t border-slate-100">
      <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
        Generate by AI
      </p>
      <Textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Describe your cover..." 
        className="resize-none text-xs min-h-[60px]"
        rows={2}
        onKeyDown={e => { if (e.key === "Enter" && e.metaKey) generate() }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-full h-8 text-xs gap-1.5"
        onClick={generate}
        disabled={generating || !prompt.trim()}
      >
        {generating
          ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating...</>
          : <><Sparkles className="h-3 w-3 text-slate-500" /> Generate </>
        }
      </Button>
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

// ── 标签输入 ──────────────────────────────────────────────────────────
function TagInput({
  tags, onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [input, setInput] = useState("")

  const add = () => {
    const val = input.trim().toLowerCase()
    if (val && !tags.includes(val) && tags.length < 8) {
      onChange([...tags, val])
    }
    setInput("")
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 flex-wrap min-h-[24px]">
        {tags.map((t) => (
          <Badge
            key={t} variant="secondary"
            className="cursor-pointer text-xs gap-1 h-5"
            onClick={() => onChange(tags.filter((x) => x !== t))}
          >
            {t} ×
          </Badge>
        ))}
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add() }
        }}
        onBlur={add}
        placeholder="输入标签后按 Enter（最多 8 个）"
        className="h-8 text-sm"
      />
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────
export interface PublishModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  currentEditingDraftId?: string | null
  /** 封面变化时同步给 toolbar 显示 */
  onCoverChange?: (previewUrl: string | null) => void
}

interface FormState {
  name:          string
  description:   string
  tags:          string[]
  coverFile:     File | null
  coverPreview:  string | null
}

const EMPTY_FORM: FormState = {
  name: "", description: "", tags: [],
  coverFile: null, coverPreview: null,
}

export function PublishModal({ open, onOpenChange, currentEditingDraftId, onCoverChange }: PublishModalProps) {
  const { data: session } = useSession()
  const [form,     setForm]     = useState<FormState>(EMPTY_FORM)
  const [draftId,  setDraftId]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState<"draft" | "publish" | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const reset = () => { setForm(EMPTY_FORM); setDraftId(null); setError(null) }
  const close  = () => { if (!loading) { reset(); onOpenChange(false) } }

  // ── 打开时读取当前编辑草稿的元数据 ─────────────────────────────────
  useEffect(() => {
    if (!open) return
    setMetaLoading(true)

    const loadMeta = currentEditingDraftId
      ? fetch(`/api/community/templates/${currentEditingDraftId}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => data?.template ?? null)
      : (session?.user?.id
          ? fetch(`/api/community/templates?creatorId=${session.user.id}&status=draft&limit=1&orderBy=newest`)
              .then(r => r.ok ? r.json() : null)
              .then(data => data?.templates?.[0] ?? null)
          : Promise.resolve(null))

    loadMeta
      .then(tmpl => {
        if (tmpl) {
          setDraftId(tmpl.id)
          setForm({
            name:         tmpl.name || "",
            description:  tmpl.description || "",
            tags:         Array.isArray(tmpl.tags) ? tmpl.tags : [],
            coverFile:    null,
            coverPreview: tmpl.thumbnail || null,
          })
        } else {
          setForm(EMPTY_FORM)
          setDraftId(null)
        }
      })
      .catch(() => {})
      .finally(() => setMetaLoading(false))
  }, [open, currentEditingDraftId, session?.user?.id])

  // ── 提交 ──────────────────────────────────────────────────────────
  const submit = async (mode: "draft" | "publish") => {
    if (!form.name.trim()) { setError("请填写工作流名称"); return }
    setError(null)
    setLoading(mode)

    try {
      // 1. 上传封面（如果有新文件）
      let thumbnailUrl: string | null = form.coverPreview && !form.coverFile
        ? form.coverPreview  // keep existing URL
        : null
      if (form.coverFile) {
        const fd = new FormData()
        fd.append("file", form.coverFile)
        const upRes = await fetch("/api/upload", { method: "POST", body: fd })
        if (upRes.ok) {
          const { url } = await upRes.json()
          thumbnailUrl = url
        }
      }

      // 2. 获取当前画布快照
      const draftRes = await fetch("/api/draft")
      const draftData = draftRes.ok ? await draftRes.json() : null
      const canvasSnapshot = {
        nodes: draftData?.nodesJson ?? [],
        edges: draftData?.edgesJson ?? [],
      }

      const publish = mode === "publish"
      const baseFields = {
        name:           form.name.trim(),
        description:    form.description.trim() || null,
        thumbnail:      thumbnailUrl,
        tags:           form.tags,
        pricingType:    "free",
        priceInPoints:  null,
        canvasSnapshot,
      }

      let res: Response
      if (draftId) {
        // PATCH existing draft — use status/publishedAt, not publish boolean
        res = await fetch(`/api/community/templates/${draftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...baseFields,
            status:      publish ? "published" : "draft",
            publishedAt: publish ? new Date().toISOString() : null,
          }),
        })
      } else {
        // POST new — API accepts publish boolean
        res = await fetch("/api/community/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseFields, publish }),
        })
      }

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? "保存失败")
      }

      // 同步封面预览到 toolbar
      if (thumbnailUrl !== null) onCoverChange?.(thumbnailUrl)
      // 通知 browser 刷新草稿/发布列表
      window.dispatchEvent(new CustomEvent("template:saved"))

      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，请重试")
    } finally {
      setLoading(null)
    }
  }

  const busy = !!loading

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <DialogTitle className="text-base font-semibold">工作流详情</DialogTitle>
        </DialogHeader>

        <div className="flex gap-5 p-5 overflow-y-auto max-h-[72vh]">

          {/* ── 左：封面 ── */}
          <div className="w-40 shrink-0 space-y-3">
            {metaLoading
              ? <div className="aspect-square rounded-2xl bg-slate-100 animate-pulse" />
              : <CoverUpload
                  preview={form.coverPreview}
                  onFile={(file, url) => setForm((f) => ({ ...f, coverFile: file, coverPreview: url }))}
                />
            }
            <AICoverGen
              onGenerated={(url, file) =>
                setForm(f => ({ ...f, coverPreview: url, coverFile: file }))
              }
            />
          </div>

          {/* ── 右：表单 ── */}
          <div className="flex-1 space-y-4 min-w-0">

            {/* 名称 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="给你的工作流起个名字"
                className="h-9"
                maxLength={60}
              />
            </div>

            {/* 描述 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">描述</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="介绍这个工作流的用途..."
                className="resize-none text-sm"
                rows={3}
                maxLength={500}
              />
            </div>

            {/* 标签 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1">
                <Tag className="h-3 w-3" /> 标签
              </Label>
              <TagInput tags={form.tags} onChange={(t) => set("tags", t)} />
            </div>

          </div>
        </div>

        {/* ── 底部 ── */}
        <DialogFooter className="px-5 py-4 border-t bg-slate-50/80 flex-row gap-2">
          {error && (
            <p className="text-xs text-red-500 flex-1 self-center">{error}</p>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline" size="sm"
              onClick={() => submit("draft")}
              disabled={busy}
            >
              {loading === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              保存草稿
            </Button>
            <Button
              size="sm"
              onClick={() => submit("publish")}
              disabled={busy}
              className="gap-1.5"
            >
              {loading === "publish"
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <ChevronRight className="h-3.5 w-3.5" />
              }
              发布到社区
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
