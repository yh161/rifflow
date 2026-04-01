"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, UserPlus, UserCheck, MessageCircle, Play, Heart, Zap, Edit2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TemplateSummary } from "./community.types"
import { CATEGORY_LABELS } from "./community.types"

interface Profile {
  id: string
  name: string | null
  image: string | null
  isCreator: boolean
  bio: string | null
  createdAt: string
  followersCount: number
  followingCount: number
  publishedCount: number
  isFollowing: boolean
  isMe: boolean
}

interface ProfilePageProps {
  userId: string
  onBack: () => void
  onOpenDetail?: (template: TemplateSummary) => void
  onOpenChat?: (userId: string) => void
  unreadCount?: number
}

export function ProfilePage({ userId, onBack, onOpenDetail, onOpenChat, unreadCount = 0 }: ProfilePageProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [followLoading, setFollowLoading] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setLoading(true)
    setImgFailed(false)
    fetch(`/api/user/${userId}/profile`)
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile)
        setTemplates(data.templates ?? [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [userId])

  const handleFollow = async () => {
    if (!profile || followLoading) return
    setFollowLoading(true)
    try {
      const res = await fetch(`/api/user/${userId}/follow`, { method: "POST" })
      if (res.ok) {
        const { action } = await res.json()
        setProfile((p) =>
          p
            ? {
                ...p,
                isFollowing: action === "followed",
                followersCount: p.followersCount + (action === "followed" ? 1 : -1),
              }
            : p
        )
      }
    } finally {
      setFollowLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">User not found</p>
        <Button variant="ghost" onClick={onBack}>Go back</Button>
      </div>
    )
  }

  // Use the first template's cover as hero background, or the user's avatar
  const heroBgUrl = templates[0]?.thumbnail ?? profile.image
  const hasHeroBg = !!heroBgUrl && !imgFailed

  return (
    <div className="relative h-full overflow-hidden">
      <div className="relative z-10 h-full overflow-y-auto flex flex-col">

        {/* ── Hero section ── */}
        <div className="flex-shrink-0 relative overflow-hidden px-8 pt-6 pb-8">
          {/* Blurred background */}
          {hasHeroBg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroBgUrl!}
              alt=""
              aria-hidden
              width={10}
              height={5}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0"
              style={{ imageRendering: "pixelated", filter: "blur(30px)" }}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-400 pointer-events-none z-0" />
          )}
          <div className="absolute inset-0 bg-black/10 pointer-events-none z-0" />

          {/* Content */}
          <div className="relative z-10">
            <button
              className="flex items-center gap-1 text-white/60 hover:text-white/90 text-sm mb-6 transition-colors"
              onClick={onBack}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            {/* Avatar + Info */}
            <div className="flex gap-6 items-end">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {profile.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.image}
                    alt={profile.name ?? ""}
                    className="w-[120px] h-[120px] rounded-full object-cover shadow-2xl ring-4 ring-white/20"
                  />
                ) : (
                  <div className="w-[120px] h-[120px] rounded-full bg-white/20 shadow-2xl ring-4 ring-white/20 flex items-center justify-center">
                    <span className="text-4xl font-bold text-white/80">
                      {(profile.name ?? "?")[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Name + stats */}
              <div className="flex-1 min-w-0 pb-1">
                <p className="text-white/50 text-xs uppercase tracking-widest mb-1">
                  {profile.isCreator ? "Creator" : "Member"}
                </p>
                <h1 className="text-white text-3xl font-bold leading-tight mb-2 truncate">
                  {profile.name ?? "Unknown"}
                </h1>
                <div className="flex items-center gap-4 text-sm text-white/60">
                  <span><strong className="text-white">{profile.followersCount}</strong> followers</span>
                  <span><strong className="text-white">{profile.followingCount}</strong> following</span>
                  <span><strong className="text-white">{profile.publishedCount}</strong> workflows</span>
                </div>
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="mt-4 text-white/70 text-sm max-w-xl leading-relaxed">{profile.bio}</p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-3 mt-5">
              {!profile.isMe && (
                <>
                  <Button
                    className={cn(
                      "rounded-full px-6 gap-2 backdrop-blur-sm",
                      profile.isFollowing
                        ? "bg-white/30 hover:bg-white/40 text-white"
                        : "bg-white/80 hover:bg-white/90 text-black"
                    )}
                    onClick={handleFollow}
                    disabled={followLoading}
                  >
                    {profile.isFollowing ? (
                      <><UserCheck className="h-4 w-4" /> Following</>
                    ) : (
                      <><UserPlus className="h-4 w-4" /> Follow</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full px-5 gap-2 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent"
                    onClick={() => onOpenChat?.(profile.id)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Message
                  </Button>
                </>
              )}
              {profile.isMe && (
                <>
                  <Button
                    variant="outline"
                    className="rounded-full px-5 gap-2 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent relative"
                    onClick={() => onOpenChat?.("__inbox__")}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Messages
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full px-5 gap-2 border-white/20 text-white hover:bg-white/10 hover:text-white bg-transparent"
                    onClick={() => window.dispatchEvent(new CustomEvent("navigate:account"))}
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit Profile
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Published Workflows ── */}
        <div className="flex-1 px-8 py-6">
          {templates.length > 0 ? (
            <>
              <h2 className="font-semibold text-lg mb-4">
                {profile.isMe ? "My Published Workflows" : "Published Workflows"}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    className="group text-left rounded-xl overflow-hidden bg-muted/50 hover:bg-muted transition-colors"
                    onClick={() => onOpenDetail?.(t)}
                  >
                    <div className="aspect-[4/3] relative overflow-hidden">
                      {t.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.thumbnail}
                          alt={t.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          <Zap className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-sm truncate">{t.name}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {t.executionsCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Play className="h-3 w-3" /> {t.executionsCount}
                          </span>
                        )}
                        {t.favoritesCount > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Heart className="h-3 w-3" /> {t.favoritesCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Zap className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">No published workflows yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
