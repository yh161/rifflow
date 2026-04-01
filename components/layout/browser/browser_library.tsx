"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import {
  Clock, HardDrive, Users, Layers,
  Star, Download, Trash2, Image, FileText, Film,
} from "lucide-react"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { TemplateCard } from "./TemplateCard"
import type { TemplateSummary } from "./community.types"

// ── Types ────────────────────────────────────────────────────────────
interface UserAsset {
  id: string
  name: string
  type: string
  url: string
  size: number | null
  starred: boolean
  sourceTemplateId: string | null
  createdAt: string
}

interface CreatorSub {
  id: string
  status: string
  plan: {
    id: string
    name: string
    price: number
    creator: { id: string; name: string | null; image: string | null }
    templates: { id: string; name: string; thumbnail: string | null }[]
  }
}

type LibTab = "recent" | "assets" | "creators" | "collections"

// ── Utilities ─────────────────────────────────────────────────────────
function fileIcon(type: string) {
  if (type === "video") return <Film className="h-4 w-4" />
  if (type === "image") return <Image className="h-4 w-4" />
  return <FileText className="h-4 w-4" />
}

function formatSize(bytes: number | null) {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── Skeleton ───────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-2 py-2.5">
      <div className="h-9 w-9 rounded-md bg-slate-200/70 animate-pulse flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-2/5 bg-slate-200/70 rounded animate-pulse" />
        <div className="h-2.5 w-1/4 bg-slate-200/70 rounded animate-pulse" />
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="w-[150px] flex-shrink-0 space-y-3">
      <div className="aspect-square rounded-md bg-slate-200/70 animate-pulse" />
      <div className="space-y-1.5">
        <div className="h-3 w-4/5 bg-slate-200/70 rounded animate-pulse" />
        <div className="h-2.5 w-3/5 bg-slate-200/70 rounded animate-pulse" />
      </div>
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-sm text-muted-foreground py-8 text-center">{label}</p>
  )
}

// ── Recently Added (recent favorites + recent execution assets) ───────
function RecentTab() {
  const [favorites, setFavorites] = useState<TemplateSummary[]>([])
  const [assets, setAssets] = useState<UserAsset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [favRes, assetRes] = await Promise.all([
        fetch("/api/user/favorites"),
        fetch("/api/user/assets?limit=6"),
      ])
      if (favRes.ok) {
        const d = await favRes.json()
        setFavorites((d.favorites ?? []).slice(0, 6).map((f: { template: TemplateSummary }) => f.template))
      }
      if (assetRes.ok) {
        const d = await assetRes.json()
        setAssets((d.assets ?? []).slice(0, 6))
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className="space-y-6">
      {/* Recent favorite templates */}
      <div>
        <h3 className="text-2xl font-semibold tracking-tight">Recently Added</h3>
        <p className="text-sm text-muted-foreground mt-1">Recently favorited workflows</p>
        <Separator className="my-4" />
        <ScrollArea>
          <div className="flex space-x-4 pb-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              : favorites.length > 0
                ? favorites.map((t) => (
                    <TemplateCard
                      key={t.id} template={t}
                      aspectRatio="square" width={150} height={150}
                      className="w-[150px] flex-shrink-0"
                    />
                  ))
                : <EmptyState label="No favorite workflows yet" />
            }
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Recent generated assets */}
      <div>
        <h3 className="text-2xl font-semibold tracking-tight">Recent Outputs</h3>
        <p className="text-sm text-muted-foreground mt-1">Recently generated content</p>
        <Separator className="my-4" />
        <div className="space-y-1">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
            : assets.length > 0
              ? assets.map((a) => <AssetRow key={a.id} asset={a} />)
              : <EmptyState label="No generated content yet" />
          }
        </div>
      </div>
    </div>
  )
}

// ── Assets (User asset library) ───────────────────────────────────────
function AssetsTab() {
  const [assets, setAssets] = useState<UserAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [onlyStarred, setOnlyStarred] = useState(false)

  const load = async () => {
    setLoading(true)
    const res = await fetch(`/api/user/assets${onlyStarred ? "?starred=true" : ""}`)
    if (res.ok) {
      const d = await res.json()
      setAssets(d.assets ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [onlyStarred])

  const handleDelete = async (id: string) => {
    await fetch(`/api/user/assets/${id}`, { method: "DELETE" })
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">Assets</h3>
          <p className="text-sm text-muted-foreground mt-1">All your generated content</p>
        </div>
        <Badge
          variant={onlyStarred ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => setOnlyStarred((v) => !v)}
        >
          <Star className="h-3 w-3 mr-1" />
          Starred
        </Badge>
      </div>
      <Separator className="my-4" />
      <div className="space-y-1">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
          : assets.length > 0
            ? assets.map((a) => (
                <AssetRow key={a.id} asset={a} onDelete={handleDelete} />
              ))
            : <EmptyState label={onlyStarred ? "No starred content" : "No generated content yet"} />
        }
      </div>
    </div>
  )
}

// ── Creators (Subscribed creators) ────────────────────────────────────
function CreatorsTab() {
  const [subs, setSubs] = useState<CreatorSub[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/user/subscriptions")
      .then((r) => r.json())
      .then((d) => { setSubs(d.subscriptions ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Creators</h3>
      <p className="text-sm text-muted-foreground mt-1">Creators you subscribe to</p>
      <Separator className="my-4" />
      {loading
        ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
        : subs.length > 0
          ? subs.map((sub) => (
              <div key={sub.id}
                className="flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-slate-50 transition-colors"
              >
                {/* Creator avatar */}
                <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium flex-shrink-0">
                  {sub.plan.creator.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {sub.plan.creator.name ?? "Unknown Creator"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {sub.plan.name} · ${sub.plan.price}/mo
                  </p>
                </div>
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {sub.plan.templates.length} workflows
                </Badge>
              </div>
            ))
          : <EmptyState label="No subscribed creators yet" />
      }
    </div>
  )
}

// ── Collections (Template category overview) ──────────────────────────
function CollectionsTab() {
  const CATEGORIES = [
    { key: "video",     label: "Video Creation",  emoji: "🎬" },
    { key: "marketing", label: "Marketing Automation", emoji: "📣" },
    { key: "ecommerce", label: "E-commerce",  emoji: "🛍️" },
    { key: "coding",    label: "Developer Tools",  emoji: "💻" },
    { key: "writing",   label: "Content Writing",  emoji: "✍️" },
    { key: "data",      label: "Data Analysis",  emoji: "📊" },
  ]

  return (
    <div>
      <h3 className="text-2xl font-semibold tracking-tight">Collections</h3>
      <p className="text-sm text-muted-foreground mt-1">Browse workflows by industry</p>
      <Separator className="my-4" />
      <div className="grid grid-cols-2 gap-3">
        {CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <span className="text-2xl">{cat.emoji}</span>
            <span className="font-medium text-sm">{cat.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── AssetRow (Asset row, reusable) ────────────────────────────────────
function AssetRow({
  asset,
  onDelete,
}: {
  asset: UserAsset
  onDelete?: (id: string) => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-default group">
          <div className="h-9 w-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
            {fileIcon(asset.type)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{asset.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(asset.size)}
              {asset.size && " · "}
              {new Date(asset.createdAt).toLocaleDateString("zh-CN")}
            </p>
          </div>
          {asset.starred && <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem asChild>
          <a href={asset.url} download={asset.name} target="_blank" rel="noreferrer">
            <Download className="mr-2 h-3.5 w-3.5" />
            Download
          </a>
        </ContextMenuItem>
        <ContextMenuItem>
          <Star className="mr-2 h-3.5 w-3.5" />
          {asset.starred ? "Remove Star" : "Add Star"}
        </ContextMenuItem>
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => onDelete(asset.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

// ── Main component ───────────────────────────────────────────────────
type LibTabWithoutCollections = "recent" | "assets" | "creators"

const TABS: { key: LibTabWithoutCollections; icon: React.ReactNode; label: string }[] = [
  { key: "recent",      icon: <Clock className="h-3.5 w-3.5" />,    label: "Recent" },
  { key: "assets",      icon: <HardDrive className="h-3.5 w-3.5" />, label: "Assets" },
  { key: "creators",    icon: <Users className="h-3.5 w-3.5" />,    label: "Creators" },
]

export function LibraryPage({ defaultTab = "recent", onTabChange }: { defaultTab?: LibTabWithoutCollections; onTabChange?: (tab: LibTabWithoutCollections) => void }) {
  const { data: session } = useSession()
  const [tab, setTabInternal] = useState<LibTabWithoutCollections>(defaultTab)

  // Sync tab when defaultTab changes from sidebar navigation
  useEffect(() => {
    setTabInternal(defaultTab)
  }, [defaultTab])

  const setTab = (newTab: LibTabWithoutCollections) => {
    setTabInternal(newTab)
    onTabChange?.(newTab)
  }

  if (!session?.user?.id) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <HardDrive className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Please login to view asset library</p>
      </div>
    )
  }

  return (
    <div className="border-none p-0 outline-none h-full">
      {/* Content - no tabs needed since sidebar handles navigation */}
      {tab === "recent" && <RecentTab />}
      {tab === "assets" && <AssetsTab />}
      {tab === "creators" && <CreatorsTab />}
    </div>
  )
}
