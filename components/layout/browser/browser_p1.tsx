"use client"

import { useEffect, useState } from "react"
import { PlusCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

import { TemplateCard } from "./TemplateCard"
import type { TemplateSummary } from "./community.types"

// ── 骨架占位（加载中）────────────────────────────────────────────────
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

export function P1() {
  const [featured, setFeatured] = useState<TemplateSummary[]>([])
  const [trending, setTrending] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

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
    <Tabs defaultValue="music" className="h-full space-y-6">
      <div className="space-between flex items-center">
        <TabsList>
          <TabsTrigger value="music" className="relative">
            Apps
          </TabsTrigger>
          <TabsTrigger value="podcasts" disabled>
            Databases
          </TabsTrigger>
          <TabsTrigger value="live" disabled>
            Report
          </TabsTrigger>
        </TabsList>
        <div className="ml-auto mr-4">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Open
          </Button>
        </div>
      </div>

      <TabsContent value="music" className="border-none p-0 outline-none">

        {/* ── 精选推荐 ── */}
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
                      />
                    ))
                  : <p className="text-sm text-muted-foreground py-4">暂无推荐模板</p>
              }
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        {/* ── 本周热门 ── */}
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
                      />
                    ))
                  : <p className="text-sm text-muted-foreground py-4">暂无热门模板</p>
              }
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

      </TabsContent>
    </Tabs>
  )
}
