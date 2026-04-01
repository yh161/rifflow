"use client"

import React, { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { PlusCircle, UploadCloud, FolderOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

import { TemplateCard } from "./TemplateCard"
import type { TemplateSummary } from "./community.types"

type Tab = "published" | "unpublished" | "drafts" | "favorites"

function SkeletonCard() {
  return (
    <div className="w-[150px] space-y-3 flex-shrink-0">
      <div className="aspect-square rounded-md bg-slate-200/70 animate-pulse" />
      <div className="space-y-1.5">
        <div className="h-3 w-4/5 bg-slate-200/70 rounded animate-pulse" />
        <div className="h-2.5 w-3/5 bg-slate-200/70 rounded animate-pulse" />
      </div>
    </div>
  )
}

function EmptyState({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3 w-full">
      <UploadCloud className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      {action}
    </div>
  )
}


interface P3Props {
  currentEditingDraftId?: string | null
  importRef?: React.MutableRefObject<(() => void) | null>
}

export function P3({ currentEditingDraftId, importRef }: P3Props) {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<Tab>("published")
  const [published,   setPublished]   = useState<TemplateSummary[]>([])
  const [unpublished, setUnpublished] = useState<TemplateSummary[]>([])
  const [drafts,      setDrafts]      = useState<TemplateSummary[]>([])
  const [favorites,   setFavorites]   = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) return

    const loadAll = async () => {
      setLoading(true)
      try {
        const [pubRes, unpubRes, draftRes, favRes] = await Promise.all([
          fetch(`/api/community/templates?creatorId=${session.user.id}&status=published`),
          fetch(`/api/community/templates?creatorId=${session.user.id}&status=unpublished`),
          fetch(`/api/community/templates?creatorId=${session.user.id}&status=draft`),
          fetch("/api/user/favorites"),
        ])
        if (pubRes.ok)   { const d = await pubRes.json();   setPublished(d.templates ?? []) }
        if (unpubRes.ok) { const d = await unpubRes.json(); setUnpublished(d.templates ?? []) }
        if (draftRes.ok) { const d = await draftRes.json(); setDrafts(d.templates ?? []) }
        if (favRes.ok)   {
          const d = await favRes.json()
          setFavorites((d.favorites ?? []).map((f: { template: TemplateSummary }) => f.template))
        }
      } catch (e) {
        console.error("P3 load error", e)
      } finally {
        setLoading(false)
      }
    }

    loadAll()

    window.addEventListener("template:saved", loadAll)
    return () => window.removeEventListener("template:saved", loadAll)
  }, [session?.user?.id])

  // ── Delete draft (editing draft cannot be deleted) ─────────────────────
  const handleDeleteDraft = async (id: string) => {
    if (id === currentEditingDraftId) {
      alert("Cannot delete workflow being edited")
      return
    }
    const res = await fetch(`/api/community/templates/${id}`, { method: "DELETE" })
    if (res.ok) setDrafts((prev) => prev.filter((t) => t.id !== id))
  }

  // ── Delete unpublished ─────────────────────────────────────────────────
  const handleDeleteUnpublished = async (id: string) => {
    if (!confirm("Confirm to permanently delete this workflow? This action cannot be undone.")) return
    const res = await fetch(`/api/community/templates/${id}`, { method: "DELETE" })
    if (res.ok) setUnpublished((prev) => prev.filter((t) => t.id !== id))
  }

  // ── Unpublish (published → unpublished) ────────────────────────────────
  const handleUnpublish = async (id: string) => {
    if (!confirm("Confirm to unpublish this workflow? Other users will no longer see it, but your data (including likes) will be retained.")) return
    const res = await fetch(`/api/community/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "unpublished", publishedAt: null }),
    })
    if (res.ok) {
      const template = published.find((t) => t.id === id)
      if (template) {
        setPublished((prev) => prev.filter((t) => t.id !== id))
        setUnpublished((prev) => [{ ...template, publishedAt: null }, ...prev])
      }
    }
  }

  // ── Republish (unpublished → published) ────────────────────────────────
  const handleRepublish = async (id: string) => {
    const now = new Date().toISOString()
    const res = await fetch(`/api/community/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published", publishedAt: now }),
    })
    if (res.ok) {
      const template = unpublished.find((t) => t.id === id)
      if (template) {
        setUnpublished((prev) => prev.filter((t) => t.id !== id))
        setPublished((prev) => [{ ...template, publishedAt: now }, ...prev])
      }
    }
  }

  // ── Load to canvas (load directly without saving current state) ────────
  const handleLoadToCanvas = async (id: string) => {
    try {
      const res = await fetch(`/api/community/templates/${id}/snapshot`)
      if (!res.ok) return
      const { nodes, edges } = await res.json()
      window.dispatchEvent(new CustomEvent("canvas:load", { detail: { nodes, edges, draftId: id } }))

      // Sync cover to toolbar
      const tmpl = [...published, ...drafts, ...unpublished].find(t => t.id === id)
      window.dispatchEvent(new CustomEvent("canvas:cover-change", { detail: { url: tmpl?.thumbnail ?? null } }))
    } catch (e) {
      console.error("canvas:load error", e)
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "published",   label: "Published",  count: published.length },
    { key: "unpublished", label: "Unpublished",  count: unpublished.length },
    { key: "drafts",      label: "Drafts",    count: drafts.length },
    { key: "favorites",   label: "Favorites", count: favorites.length },
  ]

  // Sort drafts: editing draft always first
  const sortedDrafts = currentEditingDraftId
    ? [...drafts].sort((a, b) => {
        if (a.id === currentEditingDraftId) return -1
        if (b.id === currentEditingDraftId) return 1
        return 0
      })
    : drafts

  const current =
    activeTab === "published"   ? published
    : activeTab === "unpublished" ? unpublished
    : activeTab === "drafts"      ? sortedDrafts
    : favorites

  // Check if draft is being edited
  const isDraftEditing = (id: string) => activeTab === "drafts" && id === currentEditingDraftId

  return (
    <div className="border-none p-0 outline-none h-full">

      {/* ── Title + Create Button ── */}
      <div className="flex items-center justify-between mb-1">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Create</h2>
          <p className="text-sm text-muted-foreground">
            Your workflow library and favorites.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => importRef?.current?.()}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Import
          </Button>
          <Button size="sm" onClick={() => {
            setActiveTab("drafts")
            window.dispatchEvent(new CustomEvent("canvas:new", { detail: { keepPanelOpen: true, currentDraftId: currentEditingDraftId } }))
          }}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* ── Tab 切换 ── */}
      <div className="flex gap-2 my-4 flex-wrap">
        {tabs.map(({ key, label, count }) => (
          <Badge
            key={key}
            variant={activeTab === key ? "default" : "outline"}
            className="cursor-pointer select-none gap-1.5"
            onClick={() => setActiveTab(key)}
          >
            {label}
            {count > 0 && (
              <span className="bg-white/20 text-[10px] px-1 rounded-full">
                {count}
              </span>
            )}
          </Badge>
        ))}
      </div>

      <Separator className="my-4" />

      {/* ── Content Area ── */}
      {!session?.user?.id ? (
        <EmptyState label="Please login to view your workflow library" />
      ) : (
        <div className="relative">
          <ScrollArea>
            <div className="flex space-x-4 pb-4">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                : current.length > 0
                  ? current.map((t, i) => (
                      <div key={t.id} className="relative flex-shrink-0">
                        {/* Show "Editing" badge for current editing draft */}
                        {isDraftEditing(t.id) && (
                          <span className="absolute top-1.5 left-1.5 z-10 text-[9px] font-semibold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full pointer-events-none">
                            Editing
                          </span>
                        )}
                        <TemplateCard
                          template={t}
                          aspectRatio="square"
                          width={150}
                          height={150}
                          className="w-[150px]"
                          isEditing={isDraftEditing(t.id)}
                          onDelete={
                            activeTab === "drafts" && !isDraftEditing(t.id)
                              ? handleDeleteDraft
                              : activeTab === "unpublished"
                                ? handleDeleteUnpublished
                                : undefined
                          }
                          onUnpublish={activeTab === "published" ? handleUnpublish : undefined}
                          onRepublish={activeTab === "unpublished" ? handleRepublish : undefined}
                          onLoadToCanvas={
                            activeTab !== "favorites" && !isDraftEditing(t.id)
                              ? handleLoadToCanvas
                              : undefined
                          }
                        />
                      </div>
                    ))
                  : <EmptyState
                      label={
                        activeTab === "published"   ? "No workflows published yet"
                        : activeTab === "unpublished" ? "No unpublished workflows"
                        : activeTab === "drafts"      ? "No drafts, click the cloud icon to save current canvas"
                        : "No favorites yet"
                      }
                    />
              }
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
