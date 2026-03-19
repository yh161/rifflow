"use client"

import { useState, useRef, useCallback } from "react"
import {
  Camera, Tag, ChevronRight, Loader2,
  ImageIcon, DollarSign, Unlock, Lock,
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
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { CATEGORY_LABELS } from "@/components/layout/browser/community.types"

// ── 定价方案 ─────────────────────────────────────────────────────────
type PricingType = "free" | "pay_per_use" | "subscription"

const PRICING_OPTIONS: {
  value: PricingType
  icon: React.ReactNode
  label: string
  sub: string
}[] = [
  {
    value: "free",
    icon:  <Unlock className="h-4 w-4" />,
    label: "免费",
    sub:   "任何人可以免费执行",
  },
  {
    value: "pay_per_use",
    icon:  <DollarSign className="h-4 w-4" />,
    label: "按次付费",
    sub:   "每次执行消耗用户积分（你设定数量）",
  },
  {
    value: "subscription",
    icon:  <Lock className="h-4 w-4" />,
    label: "订阅专属",
    sub:   "仅订阅了你套餐的用户可用",
  },
]

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
        "relative w-full aspect-square rounded-2xl border-2 border-dashed",
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
          <div className="absolute inset-0 bg-black/0 hover:bg-black/25 transition-colors flex items-center justify-center">
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
      <div className="flex gap-1.5 flex-wrap min-h-[28px]">
        {tags.map((t) => (
          <Badge
            key={t} variant="secondary"
            className="cursor-pointer text-xs gap-1"
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
  /** canvas 当前节点/边，传给 API 用 */
  canvasSnapshot: { nodes: unknown[]; edges: unknown[] }
  /** 封面变化时同步给 toolbar 显示 */
  onCoverChange?: (previewUrl: string | null) => void
}

interface FormState {
  name:          string
  description:   string
  category:      string
  tags:          string[]
  pricing:       PricingType
  priceInPoints: string          // 积分数量（整数）
  coverFile:     File | null
  coverPreview:  string | null
}

const INITIAL: FormState = {
  name: "", description: "", category: "general", tags: [],
  pricing: "free", priceInPoints: "10",
  coverFile: null, coverPreview: null,
}

export function PublishModal({ open, onOpenChange, canvasSnapshot, onCoverChange }: PublishModalProps) {
  const [form, setForm] = useState<FormState>(INITIAL)
  const [loading, setLoading] = useState<"draft" | "publish" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }))

  const reset = () => { setForm(INITIAL); setError(null) }
  const close  = () => { if (!loading) { reset(); onOpenChange(false) } }

  // ── 提交 ──────────────────────────────────────────────────────────
  const submit = async (publish: boolean) => {
    if (!form.name.trim()) { setError("请填写工作流名称"); return }
    setError(null)
    setLoading(publish ? "publish" : "draft")

    try {
      // 1. 上传封面（如果有）
      let thumbnailUrl: string | null = null
      if (form.coverFile) {
        const fd = new FormData()
        fd.append("file", form.coverFile)
        const upRes = await fetch("/api/upload", { method: "POST", body: fd })
        if (upRes.ok) {
          const { url } = await upRes.json()
          thumbnailUrl = url
        }
      }

      // 2. 发布模板
      const body = {
        name:           form.name.trim(),
        description:    form.description.trim() || null,
        thumbnail:      thumbnailUrl,
        category:       form.category,
        tags:           form.tags,
        pricingType:    form.pricing,
        priceInPoints:  form.pricing === "pay_per_use"
                          ? parseInt(form.priceInPoints, 10) || 10
                          : null,
        canvasSnapshot: canvasSnapshot,
        publish,
      }

      const res = await fetch("/api/community/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? "发布失败")
      }

      // 同步封面预览到 toolbar
      if (form.coverPreview) onCoverChange?.(form.coverPreview)
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布失败，请重试")
    } finally {
      setLoading(null)
    }
  }

  const busy = !!loading

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-base font-semibold">发布到社区</DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 p-6 overflow-y-auto max-h-[70vh]">

          {/* ── 左：封面 ── */}
          <div className="w-44 shrink-0 space-y-3">
            <CoverUpload
              preview={form.coverPreview}
              onFile={(file, url) => setForm((f) => ({ ...f, coverFile: file, coverPreview: url }))}
            />
            <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
              点击上传封面<br />作为社区卡片展示
            </p>
          </div>

          {/* ── 右：表单 ── */}
          <div className="flex-1 space-y-4 min-w-0">

            {/* 名称 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">工作流名称 *</Label>
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
                placeholder="介绍这个工作流的用途和使用方法..."
                className="resize-none text-sm"
                rows={3}
                maxLength={500}
              />
            </div>

            {/* 分类 + 标签 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">分类</Label>
                <Select value={form.category} onValueChange={(v) => set("category", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS)
                      .filter(([k]) => k !== "general")
                      .map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <Tag className="h-3 w-3" /> 标签
                </Label>
                <TagInput tags={form.tags} onChange={(t) => set("tags", t)} />
              </div>
            </div>

            {/* 定价方案 */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">定价方案</Label>
              <div className="space-y-2">
                {PRICING_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                      form.pricing === opt.value
                        ? "border-slate-900 bg-slate-50"
                        : "border-slate-200 hover:border-slate-300",
                    )}
                  >
                    <input
                      type="radio"
                      name="pricing"
                      value={opt.value}
                      checked={form.pricing === opt.value}
                      onChange={() => set("pricing", opt.value)}
                      className="sr-only"
                    />
                    <span className={cn(
                      "flex-shrink-0",
                      form.pricing === opt.value ? "text-slate-900" : "text-slate-400",
                    )}>
                      {opt.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-none">{opt.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.sub}</p>
                    </div>

                    {/* Pay per use 积分输入 */}
                    {opt.value === "pay_per_use" && form.pricing === "pay_per_use" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Input
                          value={form.priceInPoints}
                          onChange={(e) => set("priceInPoints", e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-7 w-14 text-sm text-center px-1"
                          type="number"
                          min="1"
                          step="1"
                        />
                        <span className="text-xs text-slate-400">积分/次</span>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── 底部 ── */}
        <DialogFooter className="px-6 py-4 border-t bg-slate-50/80 flex-row gap-2">
          {error && (
            <p className="text-xs text-red-500 flex-1 self-center">{error}</p>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline" size="sm"
              onClick={() => submit(false)}
              disabled={busy}
            >
              {loading === "draft" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              保存草稿
            </Button>
            <Button
              size="sm"
              onClick={() => submit(true)}
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
