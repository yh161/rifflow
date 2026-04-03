"use client"

import { useEffect, useState } from "react"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

import { TemplateCard } from "./TemplateCard"
import type { TemplateSummary } from "./community.types"

interface P1Props {
  onOpenDetail?: (template: TemplateSummary) => void
}

// ── Skeleton placeholder (loading) ─────────────────────────────────
function SkeletonCard({ wide = false }: { wide?: boolean }) {
  return (
    <div className={`${wide ? "w-[250px]" : "w-[150px]"} space-y-3 flex-shrink-0`}>
      <div className={`rounded-md bg-slate-200/70 animate-pulse ${wide ? "aspect-[3/4]" : "aspect-square"}`} />
      <div className="space-y-1.5">
        <div className="h-3 w-4/5 bg-slate-200/70 rounded animate-pulse" />
        <div className="h-2.5 w-3/5 bg-slate-200/70 rounded animate-pulse" />
      </div>
    </div>
  )
}

export function P1({ onOpenDetail }: P1Props) {
  const [featured, setFeatured] = useState<TemplateSummary[]>([])
  const [trending, setTrending] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  const handleCopyToDraft = async (id: string) => {
    try {
      const snapRes = await fetch(`/api/community/templates/${id}/snapshot`)
      if (!snapRes.ok) return
      const { nodes, edges, favorites } = await snapRes.json()
      const tmpl = [...featured, ...trending].find(t => t.id === id)
      const createRes = await fetch("/api/community/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:           tmpl?.name ? `${tmpl.name} Copy` : "Untitled Workflow",
          thumbnail:      tmpl?.thumbnail ?? undefined,
          canvasSnapshot: { nodes, edges, favorites: Array.isArray(favorites) ? favorites : [] },
          publish:        false,
        }),
      })
      window.dispatchEvent(new CustomEvent("template:saved"))
    } catch (e) {
      console.error("copy to draft error", e)
    }
  }

  const handleCopyAndLoadToCanvas = async (id: string) => {
    try {
      const snapRes = await fetch(`/api/community/templates/${id}/snapshot`)
      if (!snapRes.ok) return
      const { nodes, edges, favorites } = await snapRes.json()
      const tmpl = [...featured, ...trending].find(t => t.id === id)
      // Load community canvas with Copy suffix and save current content before loading
      window.dispatchEvent(new CustomEvent("canvas:load", {
        detail: {
          nodes,
          edges,
          favorites: Array.isArray(favorites) ? favorites : [],
          draftName: tmpl?.name ? `${tmpl.name} Copy` : "Untitled Workflow Copy",
          thumbnail: tmpl?.thumbnail ?? null,
          saveBefore: true
        }
      }))
      window.dispatchEvent(new CustomEvent("canvas:cover-change", { detail: { url: tmpl?.thumbnail ?? null } }))
    } catch (e) {
      console.error("copy and load error", e)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [fRes, tRes] = await Promise.all([
          fetch("/api/community/templates?orderBy=popular&limit=4"),
          fetch("/api/community/templates?orderBy=popular&limit=6"),
        ])
        if (fRes.ok) {
          const { templates } = await fRes.json()
          setFeatured(templates)
        }
        if (tRes.ok) {
          const { templates } = await tRes.json()
          setTrending(templates)
        }
      } catch (e) {
        console.error("Failed to load templates", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="h-full space-y-6">
      {/* ── Featured ── */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Made for you</h2>
          <p className="text-sm text-muted-foreground">Update daily.</p>
        </div>
      </div>
      <Separator className="my-4" />
      <div className="relative">
        <ScrollArea>
          <div className="flex space-x-4 pb-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} wide />)
              : featured.length > 0
                ? featured.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      aspectRatio="portrait"
                      width={250}
                      height={330}
                      className="w-[250px] flex-shrink-0"
                      onCopyToDraft={handleCopyToDraft}
                      onCopyAndLoadToCanvas={handleCopyAndLoadToCanvas}
                      onOpenDetail={onOpenDetail}
                    />
                  ))
                : <p className="text-sm text-muted-foreground py-4">No featured templates</p>
            }
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* ── Trending This Week ── */}
      <div className="mt-6 space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Weekly Trend</h2>
        <p className="text-sm text-muted-foreground">Trend</p>
      </div>
      <Separator className="my-4" />
      <div className="relative">
        <ScrollArea>
          <div className="flex space-x-4 pb-4">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : trending.length > 0
                ? trending.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      aspectRatio="square"
                      width={150}
                      height={150}
                      className="w-[150px] flex-shrink-0"
                      onCopyToDraft={handleCopyToDraft}
                      onCopyAndLoadToCanvas={handleCopyAndLoadToCanvas}
                      onOpenDetail={onOpenDetail}
                    />
                  ))
                : <p className="text-sm text-muted-foreground py-4">No trending templates</p>
            }
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  )
}
