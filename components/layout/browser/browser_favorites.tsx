"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { Heart } from "lucide-react"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

import { TemplateCard } from "./TemplateCard"
import type { TemplateSummary } from "./community.types"

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

export function FavoritesPage() {
  const { data: session } = useSession()
  const [favorites, setFavorites] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.user?.id) return
    fetch("/api/user/favorites")
      .then((r) => r.json())
      .then((d) => {
        setFavorites((d.favorites ?? []).map((f: { template: TemplateSummary }) => f.template))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session?.user?.id])

  const handleFavorite = (id: string, action: "added" | "removed") => {
    if (action === "removed") {
      setFavorites((prev) => prev.filter((t) => t.id !== id))
    }
  }

  if (!session?.user?.id) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <Heart className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Please login to view favorites</p>
      </div>
    )
  }

  return (
    <div className="border-none p-0 outline-none h-full">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Favorites</h2>
        <p className="text-sm text-muted-foreground">All your favorite workflows</p>
      </div>
      <Separator className="my-4" />

      {loading ? (
        <ScrollArea>
          <div className="flex space-x-4 pb-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Heart className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No favorite workflows yet</p>
          <p className="text-xs text-muted-foreground">Click ♥ in Browse to add favorites</p>
        </div>
      ) : (
        <>
          {/* Large cards - first four */}
          <ScrollArea>
            <div className="flex space-x-4 pb-4">
              {favorites.slice(0, 4).map((t) => (
                <TemplateCard
                  key={t.id} template={{ ...t, isFavorited: true }}
                  aspectRatio="portrait" width={250} height={330}
                  className="w-[250px] flex-shrink-0"
                  onFavorite={handleFavorite}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>

          {/* Small cards - the rest */}
          {favorites.length > 4 && (
            <>
              <div className="mt-6 space-y-1">
                <h3 className="text-lg font-semibold tracking-tight">More</h3>
              </div>
              <Separator className="my-4" />
              <ScrollArea>
                <div className="flex space-x-4 pb-4">
                  {favorites.slice(4).map((t) => (
                    <TemplateCard
                      key={t.id} template={{ ...t, isFavorited: true }}
                      aspectRatio="square" width={150} height={150}
                      className="w-[150px] flex-shrink-0"
                      onFavorite={handleFavorite}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </>
          )}
        </>
      )}
    </div>
  )
}
