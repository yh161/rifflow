"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { PlusCircle, UploadCloud } from "lucide-react"

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

export function P3() {
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

  // ── 删除草稿 ──────────────────────────────────────────────────────────────
  const handleDeleteDraft = async (id: string) => {
    const res = await fetch(`/api/community/templates/${id}`, { method: "DELETE" })
    if (res.ok) setDrafts((prev) => prev.filter((t) => t.id !== id))
  }

  // ── 删除已下架 ────────────────────────────────────────────────────────────
  const handleDeleteUnpublished = async (id: string) => {
    if (!confirm("确认永久删除这个工作流？此操作不可撤销。")) return
    const res = await fetch(`/api/community/templates/${id}`, { method: "DELETE" })
    if (res.ok) setUnpublished((prev) => prev.filter((t) => t.id !== id))
  }

  // ── 下架（published → unpublished）────────────────────────────────────────
  const handleUnpublish = async (id: string) => {
    if (!confirm("确认下架这个工作流？其他用户将无法看到它，但你的数据（包括点赞）将保留。")) return
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

  // ── 重新发布（unpublished → published）────────────────────────────────────
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

  // ── 载入画布 ──────────────────────────────────────────────────────────────
  const handleLoadToCanvas = async (id: string) => {
    try {
      const res = await fetch(`/api/community/templates/${id}/snapshot`)
      if (!res.ok) return
      const { nodes, edges } = await res.json()
      window.dispatchEvent(new CustomEvent("canvas:load", { detail: { nodes, edges } }))
    } catch (e) {
      console.error("canvas:load error", e)
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "published",   label: "已发布",  count: published.length },
    { key: "unpublished", label: "已下架",  count: unpublished.length },
    { key: "drafts",      label: "草稿",    count: drafts.length },
    { key: "favorites",   label: "我的收藏", count: favorites.length },
  ]

  const current =
    activeTab === "published"   ? published
    : activeTab === "unpublished" ? unpublished
    : activeTab === "drafts"      ? drafts
    : favorites

  return (
    <div className="border-none p-0 outline-none h-full">

      {/* ── 标题 + 发布按钮 ── */}
      <div className="flex items-center justify-between mb-1">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Create</h2>
          <p className="text-sm text-muted-foreground">
            你的工作流库和收藏。
          </p>
        </div>
        <Button size="sm" onClick={() => window.dispatchEvent(new CustomEvent("canvas:new"))}>
          <PlusCircle className="mr-2 h-4 w-4" />
          新建工作流
        </Button>
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

      {/* ── 内容区 ── */}
      {!session?.user?.id ? (
        <EmptyState label="请先登录查看你的工作流库" />
      ) : (
        <div className="relative">
          <ScrollArea>
            <div className="flex space-x-4 pb-4">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                : current.length > 0
                  ? current.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        aspectRatio="square"
                        width={150}
                        height={150}
                        className="w-[150px] flex-shrink-0"
                        onDelete={
                          activeTab === "drafts"      ? handleDeleteDraft
                          : activeTab === "unpublished" ? handleDeleteUnpublished
                          : undefined
                        }
                        onUnpublish={activeTab === "published" ? handleUnpublish : undefined}
                        onRepublish={activeTab === "unpublished" ? handleRepublish : undefined}
                        onLoadToCanvas={activeTab === "unpublished" ? handleLoadToCanvas : undefined}
                      />
                    ))
                  : <EmptyState
                      label={
                        activeTab === "published"   ? "还没有发布任何工作流"
                        : activeTab === "unpublished" ? "没有已下架的工作流"
                        : activeTab === "drafts"      ? "没有草稿"
                        : "还没有收藏任何工作流"
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
