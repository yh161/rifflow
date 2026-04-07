"use client"

import { useEffect, useState, useCallback } from "react"
import { Workflow, Users, SearchX, ChevronRight, BadgeCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { TemplateCard } from "./TemplateCard"
import { CATEGORY_LABELS } from "./community.types"
import type { TemplateSummary } from "./community.types"

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowHit extends TemplateSummary {
  _score?: number
}

interface UserHit {
  id: string
  name: string | null
  image: string | null
  isCreator: boolean
  bio: string | null
  followersCount: number
  publishedCount: number
  _score?: number
}

interface SearchResponse {
  workflows: WorkflowHit[]
  users: UserHit[]
  meta: { query: string; workflowsTotal: number; usersTotal: number }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SearchResultsPageProps {
  query: string
  onOpenDetail?: (template: TemplateSummary) => void
  onOpenProfile?: (userId: string) => void
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────

function WorkflowSkeleton() {
  return (
    <div className="w-[140px] flex-shrink-0 space-y-2">
      <div className="aspect-[3/4] rounded-md bg-slate-200/70 animate-pulse" />
      <div className="h-3 w-4/5 bg-slate-200/70 rounded animate-pulse" />
      <div className="h-2.5 w-3/5 bg-slate-200/70 rounded animate-pulse" />
    </div>
  )
}

function UserSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-10 w-10 rounded-full bg-slate-200/70 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 bg-slate-200/70 rounded animate-pulse" />
        <div className="h-2.5 w-48 bg-slate-200/70 rounded animate-pulse" />
      </div>
    </div>
  )
}

// ─── Category pill ────────────────────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const label = CATEGORY_LABELS[category] ?? category
  if (!label || label === "All") return null
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 ml-1">
      {label}
    </span>
  )
}

// ─── User row item ────────────────────────────────────────────────────────────

function UserRow({ user, onOpenProfile }: { user: UserHit; onOpenProfile?: (id: string) => void }) {
  const initials = (user.name ?? "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <button
      className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 hover:bg-slate-100/70 transition-colors text-left group"
      onClick={() => onOpenProfile?.(user.id)}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? ""}
            className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-semibold ring-1 ring-slate-200">
            {initials}
          </div>
        )}
        {user.isCreator && (
          <BadgeCheck
            className="absolute -bottom-0.5 -right-0.5 h-4 w-4 text-blue-500 fill-white"
            strokeWidth={2.5}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">{user.name ?? "Unknown"}</span>
          {user.isCreator && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-blue-50 text-blue-600 border-blue-100">
              Creator
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          {user.followersCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Users className="h-3 w-3" />
              {user.followersCount.toLocaleString()} followers
            </span>
          )}
          {user.publishedCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Workflow className="h-3 w-3" />
              {user.publishedCount} workflows
            </span>
          )}
          {user.bio && (
            <span className="truncate opacity-70">{user.bio}</span>
          )}
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count: number
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="font-semibold text-base">{title}</h3>
        <span className="text-xs text-muted-foreground bg-slate-100 rounded-full px-2 py-0.5">
          {count}
        </span>
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptySection({ label }: { label: string }) {
  return (
    <p className="text-sm text-muted-foreground py-3 px-1">No {label} found.</p>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SearchResultsPage({
  query,
  onOpenDetail,
  onOpenProfile,
}: SearchResultsPageProps) {
  const [results, setResults] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`)
      if (!res.ok) throw new Error("Search failed")
      const data: SearchResponse = await res.json()
      setResults(data)
    } catch {
      setError("Search failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    doSearch(query)
  }, [query, doSearch])

  // Copy-to-draft helper (reused from P1)
  const handleCopyToDraft = async (id: string) => {
    try {
      const snapRes = await fetch(`/api/community/templates/${id}/snapshot`)
      if (!snapRes.ok) return
      const { nodes, edges, favorites } = await snapRes.json()
      const tmpl = results?.workflows.find((t) => t.id === id)
      await fetch("/api/community/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tmpl?.name ? `${tmpl.name} Copy` : "Untitled Workflow",
          thumbnail: tmpl?.thumbnail ?? undefined,
          canvasSnapshot: { nodes, edges, favorites: Array.isArray(favorites) ? favorites : [] },
          publish: false,
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
      const tmpl = results?.workflows.find((t) => t.id === id)
      window.dispatchEvent(new CustomEvent("canvas:load", {
        detail: {
          nodes,
          edges,
          favorites: Array.isArray(favorites) ? favorites : [],
          draftName: tmpl?.name ? `${tmpl.name} Copy` : "Untitled Workflow Copy",
          thumbnail: tmpl?.thumbnail ?? null,
          saveBefore: true,
        },
      }))
      window.dispatchEvent(new CustomEvent("canvas:cover-change", { detail: { url: tmpl?.thumbnail ?? null } }))
    } catch (e) {
      console.error("copy and load error", e)
    }
  }

  // ─── No query state ───────────────────────────────────────────────────────
  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <SearchX className="h-10 w-10 opacity-30" />
        <p className="text-sm">Type something to search…</p>
      </div>
    )
  }

  const hasWorkflows = (results?.workflows.length ?? 0) > 0
  const hasUsers     = (results?.users.length ?? 0)     > 0
  const hasResults   = hasWorkflows || hasUsers

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {loading
            ? "Searching…"
            : `Results for "${query}"`}
        </h2>
        {!loading && results && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {results.meta.workflowsTotal + results.meta.usersTotal} results
          </p>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* ── Workflows section ── */}
      <section>
        <SectionHeader
          icon={<Workflow className="h-4 w-4" />}
          title="Workflows"
          count={loading ? 0 : (results?.meta.workflowsTotal ?? 0)}
        />
        <Separator className="mb-4" />

        {loading ? (
          <div className="flex gap-4 pb-2">
            {Array.from({ length: 5 }).map((_, i) => <WorkflowSkeleton key={i} />)}
          </div>
        ) : hasWorkflows ? (
          <div className="flex flex-wrap gap-4">
            {results!.workflows.map((t) => (
              <div key={t.id} className="relative">
                <TemplateCard
                  template={t}
                  aspectRatio="portrait"
                  width={140}
                  height={186}
                  className="w-[140px] flex-shrink-0"
                  onCopyToDraft={handleCopyToDraft}
                  onCopyAndLoadToCanvas={handleCopyAndLoadToCanvas}
                  onOpenDetail={onOpenDetail}
                />
                {/* Category label under card */}
                <CategoryBadge category={t.category} />
              </div>
            ))}
          </div>
        ) : (
          <EmptySection label="workflows" />
        )}
      </section>

      {/* ── Users section ── */}
      <section>
        <SectionHeader
          icon={<Users className="h-4 w-4" />}
          title="People"
          count={loading ? 0 : (results?.meta.usersTotal ?? 0)}
        />
        <Separator className="mb-2" />

        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => <UserSkeleton key={i} />)}
          </div>
        ) : hasUsers ? (
          <div className="space-y-0.5">
            {results!.users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        ) : (
          <EmptySection label="people" />
        )}
      </section>

      {/* ── No results at all ── */}
      {!loading && !error && !hasResults && (
        <div className={cn(
          "flex flex-col items-center justify-center py-16 gap-4 text-muted-foreground"
        )}>
          <SearchX className="h-12 w-12 opacity-25" />
          <p className="text-base font-medium">No results found</p>
          <p className="text-sm opacity-70">
            Try a different keyword or browse the community
          </p>
        </div>
      )}
    </div>
  )
}
