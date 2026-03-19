"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/input"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

import { TemplateCard } from "./TemplateCard"
import { CATEGORY_LABELS, type TemplateSummary } from "./community.types"

const CATEGORIES = Object.entries(CATEGORY_LABELS)  // [["general","全部"], ...]

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

export function P2() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState("general")
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          orderBy: "popular",
          limit:   "20",
          ...(activeCategory !== "general" && { category: activeCategory }),
          ...(debounced && { search: debounced }),
        })
        const res = await fetch(`/api/community/templates?${params}`)
        if (res.ok) {
          const { templates: data } = await res.json()
          setTemplates(data)
        }
      } catch (e) {
        console.error("Failed to load templates", e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [activeCategory, debounced])

  // 把模板按行业分组，用于分区显示
  const featured = templates.filter((_, i) => i < 4)
  const rest     = templates.filter((_, i) => i >= 4)

  return (
    <div className="border-none p-0 outline-none h-full">

      {/* ── 搜索框 ── */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索工作流..."
          className="pl-9 bg-slate-50 border-slate-200"
        />
      </div>

      {/* ── 分类筛选徽章 ── */}
      <div className="flex gap-2 flex-wrap mb-4">
        {CATEGORIES.map(([key, label]) => (
          <Badge
            key={key}
            variant={activeCategory === key ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => setActiveCategory(key)}
          >
            {label}
          </Badge>
        ))}
      </div>

      {/* ── 热门精选（大卡片）── */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Industries</h2>
          <p className="text-sm text-muted-foreground">Top picks for you. Updated daily.</p>
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
                    />
                  ))
                : <p className="text-sm text-muted-foreground py-4">
                    {debounced ? `没有找到 "${debounced}" 的相关工作流` : "暂无模板"}
                  </p>
            }
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* ── 更多模板（小卡片）── */}
      {(loading || rest.length > 0) && (
        <>
          <div className="mt-6 space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Made for You</h2>
            <p className="text-sm text-muted-foreground">Your personal playlists. Updated daily.</p>
          </div>
          <Separator className="my-4" />
          <div className="relative">
            <ScrollArea>
              <div className="flex space-x-4 pb-4">
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
                  : rest.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        aspectRatio="square"
                        width={150}
                        height={150}
                        className="w-[150px] flex-shrink-0"
                      />
                    ))
                }
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </>
      )}
    </div>
  )
}
