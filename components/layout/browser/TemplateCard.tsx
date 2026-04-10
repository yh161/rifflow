"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { resolveFileUrl } from "@/lib/file-url"
import { Heart, Play, Zap, Lock, Star, Trash2, EyeOff, RefreshCw, DownloadCloud, Copy, LogIn } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import type { TemplateCardProps } from "./community.types"

// Pricing badge
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
  isEditing = false,
  onFavorite,
  onExecute,
  onDelete,
  onUnpublish,
  onRepublish,
  onMakePublic,
  onLoadToCanvas,
  onCopyToDraft,
  onCopyAndLoadToCanvas,
  onOpenDetail,
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

  // Editing card: no context menu and hover action buttons, but keep hover zoom effect
  if (isEditing) {
    return (
      <div className={className}>
        <div className="relative overflow-hidden rounded-md group">
          {/* Cover image - keep hover zoom effect */}
          {template.thumbnail && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolveFileUrl(template.thumbnail)}
              alt={template.name}
              onError={() => setImgFailed(true)}
              className={cn(
                "w-full object-cover transition-all group-hover:scale-105",
                isPortrait ? "aspect-[3/4]" : "aspect-square",
              )}
            />
          ) : (
            <div className={cn(
              "w-full bg-slate-50 relative overflow-hidden",
              isPortrait ? "aspect-[3/4]" : "aspect-square",
            )}>
              <svg className="w-full h-full absolute inset-0" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
                    <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgb(203 213 225 / 0.5)" strokeWidth="0.5"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>
          )}

          {/* Pricing badge */}
          <PriceBadge
            pricingType={template.pricingType}
            priceInPoints={template.priceInPoints}
          />
        </div>

        {/* Text info */}
        <div className="mt-1 space-y-1 text-sm">
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

  return (
    <div className={className}>
      <ContextMenu>
        <ContextMenuTrigger>
          <div className="relative overflow-hidden rounded-md group cursor-pointer"
            onClick={() => onOpenDetail ? onOpenDetail(template) : onExecute?.(template)}
          >
            {/* Cover image */}
            {template.thumbnail && !imgFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolveFileUrl(template.thumbnail)}
                alt={template.name}
                onError={() => setImgFailed(true)}
                className={cn(
                  "w-full object-cover transition-all group-hover:scale-105",
                  isPortrait ? "aspect-[3/4]" : "aspect-square",
                )}
              />
            ) : (
              <div className={cn(
                "w-full bg-slate-50 relative overflow-hidden",
                isPortrait ? "aspect-[3/4]" : "aspect-square",
              )}>
                <svg className="w-full h-full absolute inset-0" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
                      <path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgb(203 213 225 / 0.5)" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>
              </div>
            )}

            {/* Pricing badge */}
            <PriceBadge
              pricingType={template.pricingType}
              priceInPoints={template.priceInPoints}
            />

            {/* Hover action layer */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
              {/* Copy / Load / Execute button */}
              {onCopyToDraft ? (
                <button
                  className="bg-white text-black p-1.5 rounded-full shadow-md hover:scale-110 transition-transform"
                  onClick={(e) => { e.stopPropagation(); onCopyToDraft(template.id) }}
                  title="Copy to Drafts"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              ) : onLoadToCanvas ? (
                <button
                  className="bg-white text-black p-1.5 rounded-full shadow-md hover:scale-110 transition-transform"
                  onClick={(e) => { e.stopPropagation(); onLoadToCanvas(template.id) }}
                  title="Load to Canvas"
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

              {/* Favorite button - not shown for personal drafts/unpublished cards (with onDelete) */}
              {!onDelete && (
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

        {/* Context menu */}
        <ContextMenuContent className="w-44">
          {/* Community card: copy options */}
          {onCopyToDraft && (
            <>
              <ContextMenuItem onClick={() => onCopyToDraft(template.id)}>
                <Copy className="mr-2 h-3.5 w-3.5" />
                Copy to Drafts
              </ContextMenuItem>
              {onCopyAndLoadToCanvas && (
                <ContextMenuItem onClick={() => onCopyAndLoadToCanvas(template.id)}>
                  <LogIn className="mr-2 h-3.5 w-3.5" />
                  Copy and Load
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
            </>
          )}

          {/* Load to canvas - for own published/draft/unpublished cards */}
          {onLoadToCanvas && (
            <ContextMenuItem onClick={() => onLoadToCanvas(template.id)}>
              <DownloadCloud className="mr-2 h-3.5 w-3.5" />
              Load to Canvas
            </ContextMenuItem>
          )}

          {/* Execute - when neither copy nor load available */}
          {!onCopyToDraft && !onLoadToCanvas && (
            <ContextMenuItem onClick={() => onExecute?.(template)}>
              <Play className="mr-2 h-3.5 w-3.5" />
              Execute Workflow
            </ContextMenuItem>
          )}

          {/* Favorite / Share - not for draft cards (without onDelete) */}
          {!onDelete && (
            <>
              <ContextMenuItem onClick={() => handleFavorite()}>
                <Heart className="mr-2 h-3.5 w-3.5" />
                {favorited ? "Remove Favorite" : "Add Favorite"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => window.dispatchEvent(new CustomEvent("navigate:profile", { detail: { userId: template.creatorId } }))}>
                <Star className="mr-2 h-3.5 w-3.5" />
                View Creator
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem>
                <Zap className="mr-2 h-3.5 w-3.5" />
                Share
              </ContextMenuItem>
            </>
          )}

          {/* Republish (unpublished card creator only) */}
          {onRepublish && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onRepublish(template.id)}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Republish
              </ContextMenuItem>
            </>
          )}

          {/* Make public (limited/private card creator only) */}
          {onMakePublic && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onMakePublic(template.id)}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                设为公开
              </ContextMenuItem>
            </>
          )}

          {/* Unpublish (published card creator only) */}
          {onUnpublish && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-amber-600 focus:text-amber-600"
                onClick={() => onUnpublish(template.id)}
              >
                <EyeOff className="mr-2 h-3.5 w-3.5" />
                Unpublish
              </ContextMenuItem>
            </>
          )}

          {/* Delete (draft/unpublished card creator only) */}
          {onDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-red-500 focus:text-red-500"
                onClick={() => onDelete(template.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Text info */}
      <div className="mt-1 space-y-1 text-sm">
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
