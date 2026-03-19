"use client"

import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Heart, Play, Zap, Lock, Star } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { TemplateCardProps } from "./community.types"

// 定价徽章
function PriceBadge({ pricingType, pricePerUse }: {
  pricingType: string
  pricePerUse: number | null
}) {
  if (pricingType === "free") return null
  return (
    <span className={cn(
      "absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm",
      pricingType === "pay_per_use"
        ? "bg-black/60 text-white"
        : "bg-purple-600/80 text-white"
    )}>
      {pricingType === "pay_per_use"
        ? pricePerUse ? `$${pricePerUse}` : "Paid"
        : <Lock className="inline h-2.5 w-2.5 mr-0.5" />}
      {pricingType === "subscription" ? "Pro" : ""}
    </span>
  )
}

// 默认缩略图（占位）
const PLACEHOLDER = "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&dpr=2&q=80"

export function TemplateCard({
  template,
  aspectRatio = "portrait",
  width = 250,
  height = 330,
  className,
  onFavorite,
  onExecute,
}: TemplateCardProps) {
  const [favorited, setFavorited] = useState(template.isFavorited ?? false)
  const [loading, setLoading] = useState(false)

  const handleFavorite = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/community/templates/${template.id}/favorite`, {
        method: "POST",
      })
      if (res.ok) {
        const { action } = await res.json()
        setFavorited(action === "added")
        onFavorite?.(template.id, action)
      }
    } finally {
      setLoading(false)
    }
  }

  const isPortrait = aspectRatio === "portrait"

  return (
    <div className={cn("space-y-3", className)}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="relative overflow-hidden rounded-md group cursor-pointer"
            onClick={() => onExecute?.(template)}
          >
            {/* 封面图 */}
            <Image
              src={template.thumbnail ?? PLACEHOLDER}
              alt={template.name}
              width={width}
              height={height}
              className={cn(
                "h-auto w-auto object-cover transition-all group-hover:scale-105",
                isPortrait ? "aspect-[3/4]" : "aspect-square"
              )}
            />

            {/* 定价徽章 */}
            <PriceBadge
              pricingType={template.pricingType}
              pricePerUse={template.pricePerUse}
            />

            {/* Hover 操作层 */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
              {/* 执行按钮 */}
              <button
                className="bg-white text-black p-1.5 rounded-full shadow-md hover:scale-110 transition-transform"
                onClick={(e) => { e.stopPropagation(); onExecute?.(template) }}
              >
                <Play className="h-3.5 w-3.5" fill="currentColor" />
              </button>

              {/* 收藏按钮 */}
              <button
                className={cn(
                  "p-1.5 rounded-full shadow-md transition-all hover:scale-110",
                  favorited ? "bg-red-500 text-white" : "bg-white/90 text-slate-600"
                )}
                onClick={handleFavorite}
              >
                <Heart className="h-3.5 w-3.5" fill={favorited ? "currentColor" : "none"} />
              </button>
            </div>
          </div>
        </ContextMenuTrigger>

        {/* 右键菜单（Apple Music 风格）*/}
        <ContextMenuContent className="w-44">
          <ContextMenuItem onClick={() => onExecute?.(template)}>
            <Play className="mr-2 h-3.5 w-3.5" />
            执行工作流
          </ContextMenuItem>
          <ContextMenuItem onClick={() => handleFavorite()}>
            <Heart className="mr-2 h-3.5 w-3.5" />
            {favorited ? "取消收藏" : "添加收藏"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>
            <Star className="mr-2 h-3.5 w-3.5" />
            查看创作者
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem>
            <Zap className="mr-2 h-3.5 w-3.5" />
            分享
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* 文字信息 */}
      <div className="space-y-1 text-sm">
        <h3 className="font-medium leading-none truncate">{template.name}</h3>
        <p className="text-xs text-muted-foreground truncate">
          {template.creator.name ?? "Unknown"}
          {template.executionsCount > 0 && (
            <span className="ml-2 text-slate-400">· {template.executionsCount} runs</span>
          )}
        </p>
      </div>
    </div>
  )
}
