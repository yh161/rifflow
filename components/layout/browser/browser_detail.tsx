"use client"

import { useState } from "react"
import { Heart, Play, Copy, ChevronLeft, Star, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TemplateSummary } from "./community.types"
import { CATEGORY_LABELS } from "./community.types"

interface WorkflowDetailPageProps {
  template: TemplateSummary
  onBack: () => void
  onOpenProfile?: (userId: string) => void
}

export function WorkflowDetailPage({ template, onBack, onOpenProfile }: WorkflowDetailPageProps) {
  const [favorited, setFavorited] = useState(template.isFavorited ?? false)
  const [favLoading, setFavLoading] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const handleFavorite = async () => {
    if (favLoading) return
    setFavLoading(true)
    try {
      const res = await fetch(`/api/community/templates/${template.id}/favorite`, { method: "POST" })
      if (res.ok) {
        const { action } = await res.json()
        setFavorited(action === "added")
      }
    } finally {
      setFavLoading(false)
    }
  }

  const handleCopyToDraft = async () => {
    try {
      const snapRes = await fetch(`/api/community/templates/${template.id}/snapshot`)
      if (!snapRes.ok) return
      const { nodes, edges } = await snapRes.json()
      await fetch("/api/community/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${template.name} Copy`,
          thumbnail: template.thumbnail ?? undefined,
          canvasSnapshot: { nodes, edges },
          publish: false,
        }),
      })
      window.dispatchEvent(new CustomEvent("template:saved"))
    } catch (e) {
      console.error("copy to draft error", e)
    }
  }

  const handleCopyAndLoad = async () => {
    try {
      const snapRes = await fetch(`/api/community/templates/${template.id}/snapshot`)
      if (!snapRes.ok) return
      const { nodes, edges } = await snapRes.json()
      window.dispatchEvent(new CustomEvent("canvas:load", {
        detail: {
          nodes,
          edges,
          draftName: `${template.name} Copy`,
          thumbnail: template.thumbnail ?? null,
          saveBefore: true,
        },
      }))
      window.dispatchEvent(new CustomEvent("canvas:cover-change", {
        detail: { url: template.thumbnail ?? null },
      }))
    } catch (e) {
      console.error("copy and load error", e)
    }
  }

  const publishedYear = template.publishedAt
    ? new Date(template.publishedAt).getFullYear()
    : null

  const pricingLabel =
    template.pricingType === "free"
      ? "免费"
      : template.pricingType === "subscription"
      ? "Pro"
      : template.priceInPoints
      ? `${template.priceInPoints} pt`
      : "付费"

  const hasCover = !!template.thumbnail && !imgFailed

  return (
    <div className="relative h-full overflow-hidden">

      {/* ── Scrollable content layer ── */}
      <div className="relative z-10 h-full overflow-y-auto flex flex-col">

        {/* Hero section with blurred background */}
        <div className="flex-shrink-0 relative overflow-hidden px-8 pt-6">

          {/* Blurred color background – hero only */}
          {hasCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={template.thumbnail!}
              alt=""
              aria-hidden
              width={10}
              height={5}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
              style={{ imageRendering: "pixelated", filter: "blur(30px)" }}
            />
          ) : (
            <div className="absolute inset-0 bg-muted pointer-events-none z-0" />
          )}
          <div className="absolute inset-0 bg-black/10 pointer-events-none z-0" />
          {/* Hero content */}
          <div className="relative z-10">
            <button
              className="flex items-center gap-1 text-white/60 hover:text-white/90 text-sm mb-8 transition-colors"
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            {/* Cover + info row */}
            <div className="flex gap-8 items-end pb-8">

              {/* Cover image */}
              <div className="flex-shrink-0 w-[180px]">
                {hasCover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={template.thumbnail!}
                    alt={template.name}
                    onError={() => setImgFailed(true)}
                    className="w-full aspect-square object-cover rounded-xl shadow-2xl"
                  />
                ) : (
                  <div className="w-full aspect-square rounded-xl bg-white/10 shadow-2xl flex items-center justify-center">
                    <Zap className="h-12 w-12 text-white/30" />
                  </div>
                )}
              </div>

              {/* Text info */}
              <div className="flex-1 min-w-0 pb-1">
                <p className="text-white/50 text-xs uppercase tracking-widest mb-2">Workflow</p>
                <h1 className="text-white text-3xl font-bold leading-tight mb-3 line-clamp-3">
                  {template.name}
                </h1>
                <button
                  className="text-white font-semibold mb-3 truncate hover:underline text-left"
                  onClick={() => onOpenProfile?.(template.creatorId)}
                >
                  {template.creator.name ?? "Unknown Creator"}
                </button>
                <p className="text-white/40 text-sm">
                  {CATEGORY_LABELS[template.category] ?? template.category}
                  {publishedYear && <> · {publishedYear}</>}
                  {" · "}{pricingLabel}
                </p>
              </div>

            </div>

            {/* ── Action buttons (inside hero) ── */}
            <div className="flex items-center gap-3 py-5">
          <Button
            className="bg-white/90 hover:bg-white/65 text-black rounded-full px-6 gap-2 backdrop-blur-sm"
            onClick={handleCopyAndLoad}
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Copy &amp; Load
          </Button>

          <Button
            variant="outline"
            className="rounded-full px-5 gap-2 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent"
            onClick={handleCopyToDraft}
          >
            <Copy className="h-4 w-4" />
            Copy to Drafts
          </Button>

          <button
            className={cn(
              "ml-1 p-2 rounded-full transition-colors",
              favorited
                ? "text-red-400 hover:text-red-300"
                : "text-white/40 hover:text-white/70"
            )}
            onClick={handleFavorite}
            disabled={favLoading}
          >
            <Heart className="h-5 w-5" fill={favorited ? "currentColor" : "none"} />
          </button>

          {/* Stats */}
          <div className="ml-auto flex items-center gap-4 text-sm text-white/40">
            {template.executionsCount > 0 && (
              <span className="flex items-center gap-1">
                <Play className="h-3.5 w-3.5" />
                {template.executionsCount.toLocaleString()} runs
              </span>
            )}
            {template.favoritesCount > 0 && (
              <span className="flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" />
                {template.favoritesCount.toLocaleString()}
              </span>
            )}
            {template.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5" />
                {template.rating.toFixed(1)}
              </span>
            )}
            </div>
            </div>{/* end action bar */}
          </div>{/* end hero content z-10 */}
        </div>{/* end hero section */}

        {/* ── Description & Tags ── */}
        <div className="flex-1 px-8 py-6 space-y-5 border-t">
          {template.description && (
            <div>
              <h3 className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground">About</h3>
              <p className="text-sm leading-relaxed text-foreground/80">{template.description}</p>
            </div>
          )}

          {template.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {template.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Creator row */}
          <button
            className="flex items-center gap-3 pt-2 hover:opacity-80 transition-opacity"
            onClick={() => onOpenProfile?.(template.creatorId)}
          >
            {template.creator.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={template.creator.image}
                alt={template.creator.name ?? ""}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                {(template.creator.name ?? "?")[0].toUpperCase()}
              </div>
            )}
            <div className="text-left">
              <p className="text-sm font-medium">{template.creator.name ?? "Unknown"}</p>
              <p className="text-xs text-muted-foreground">Creator</p>
            </div>
          </button>
        </div>

      </div>
    </div>
  )
}
