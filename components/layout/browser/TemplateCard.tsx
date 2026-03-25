"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Heart, Play, Zap, Lock, Star, Trash2, ImageIcon, EyeOff, RefreshCw, DownloadCloud } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { TemplateCardProps } from "./community.types"

// 定价徽章
function PriceBadge({ pricingType, priceInPoints }: {
  pricingType: string
  priceInPoints: number | null
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
        ? priceInPoints ? `${priceInPoints} pt` : "Paid"
        : <><Lock className="inline h-2.5 w-2.5 mr-0.5" />Pro</>}
    </span>
  )
}

export function TemplateCard({
  template,
  aspectRatio = "portrait",
  width = 250,
  height = 330,
  className,
  onFavorite,
  onExecute,
  onDelete,
  onUnpublish,
  onRepublish,
  onLoadToCanvas,
}: TemplateCardProps) {
  const [favorited, setFavorited] = useState(template.isFavorited ?? false)
  const [loading, setLoading] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

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
            {template.thumbnail && !imgFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={template.thumbnail}
                alt={template.name}
                onError={() => setImgFailed(true)}
                className={cn(
                  "w-full object-cover transition-all group-hover:scale-105",
                  isPortrait ? "aspect-[3/4]" : "aspect-square",
                )}
              />
            ) : (
              <div className={cn(
                "w-full bg-slate-100 flex flex-col items-center justify-center gap-1.5",
                isPortrait ? "aspect-[3/4]" : "aspect-square",
              )}>
                <ImageIcon className="h-5 w-5 text-slate-300" />
                <span className="text-[10px] text-slate-400">封面加载中</span>
              </div>
            )}

            {/* 定价徽章 */}
            <PriceBadge
              pricingType={template.pricingType}
              priceInPoints={template.priceInPoints}
            />

            {/* Hover 操作层 */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
              {/* 执行 / 载入按钮 */}
              {onLoadToCanvas ? (
                <button
                  className="bg-white text-black p-1.5 rounded-full shadow-md hover:scale-110 transition-transform"
                  onClick={(e) => { e.stopPropagation(); onLoadToCanvas(template.id) }}
                  title="载入画布"
                >
                  <DownloadCloud className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  className="bg-white text-black p-1.5 rounded-full shadow-md hover:scale-110 transition-transform"
                  onClick={(e) => { e.stopPropagation(); onExecute?.(template) }}
                >
                  <Play className="h-3.5 w-3.5" fill="currentColor" />
                </button>
              )}

              {/* 收藏按钮（仅在有 onExecute 时显示，下架卡片不显示） */}
              {!onLoadToCanvas && (
                <button
                  className={cn(
                    "p-1.5 rounded-full shadow-md transition-all hover:scale-110",
                    favorited ? "bg-red-500 text-white" : "bg-white/90 text-slate-600"
                  )}
                  onClick={handleFavorite}
                >
                  <Heart className="h-3.5 w-3.5" fill={favorited ? "currentColor" : "none"} />
                </button>
              )}
            </div>
          </div>
        </ContextMenuTrigger>

        {/* 右键菜单 */}
        <ContextMenuContent className="w-44">
          {/* 已发布 / 普通卡片操作 */}
          {!onLoadToCanvas && (
            <>
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
            </>
          )}

          {/* 已下架卡片操作 */}
          {onLoadToCanvas && (
            <>
              <ContextMenuItem onClick={() => onLoadToCanvas(template.id)}>
                <DownloadCloud className="mr-2 h-3.5 w-3.5" />
                载入画布
              </ContextMenuItem>
              {onRepublish && (
                <ContextMenuItem onClick={() => onRepublish(template.id)}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  重新发布
                </ContextMenuItem>
              )}
            </>
          )}

          {/* 下架（已发布卡片的创作者专属） */}
          {onUnpublish && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-amber-600 focus:text-amber-600"
                onClick={() => onUnpublish(template.id)}
              >
                <EyeOff className="mr-2 h-3.5 w-3.5" />
                下架
              </ContextMenuItem>
            </>
          )}

          {/* 删除 */}
          {onDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-red-500 focus:text-red-500"
                onClick={() => onDelete(template.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                删除
              </ContextMenuItem>
            </>
          )}
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
