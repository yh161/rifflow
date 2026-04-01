"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  LogOut, ChevronRight, ChevronDown,
  Zap, Star, GitBranch, Code2, Camera, Pencil, Check, X, Copy, User
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { PtIcon } from "@/components/layout/user-avatar"

// ── Types ─────────────────────────────────────────────────────────────

interface UserMe {
  id: string
  name: string | null
  email: string | null
  image: string | null
  isCreator: boolean
  creatorBio: string | null
  points: number
  templatesCount: number
  executionsCount: number
  favoritesCount: number
  subscriptions: {
    id: string
    status: string
    plan: {
      name: string
      price: number
      creator: { id: string; name: string | null; image: string | null }
    }
  }[]
}

interface TxItem {
  id: string
  amount: number
  type: string
  createdAt: string
  metadata: Record<string, unknown> | null
}

// ── Plan badge ─────────────────────────────────────────────────────────

// Temporary: derive "plan" from points balance until Stripe is wired
function derivePlan(points: number): "free" | "pro" | "max" {
  if (points >= 5000) return "max"
  if (points >= 1000) return "pro"
  return "free"
}

const PLAN_STYLES = {
  free: "bg-slate-100 text-slate-500",
  pro:  "bg-blue-500 text-white",
  max:  "bg-violet-600 text-white",
}

const PLAN_LABELS = { free: "Free", pro: "Pro", max: "Max" }

// ── Transaction row ────────────────────────────────────────────────────

function TxRow({ tx }: { tx: TxItem }) {
  const isCredit = tx.amount > 0
  const label = (tx.metadata as { label?: string } | null)?.label
    ?? (tx.type === "topup" ? "Points Top-up"
      : tx.type === "execution" ? "Execute Workflow"
      : tx.type === "refund"   ? "Refund"
      : tx.type)

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          isCredit ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400",
        )}>
          {isCredit ? "+" : "−"}
        </div>
        <div>
          <p className="text-sm font-medium leading-none">{label}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(tx.createdAt).toLocaleDateString("zh-CN")}
          </p>
        </div>
      </div>
      <span className={cn(
        "text-sm font-semibold tabular-nums",
        isCredit ? "text-emerald-600" : "text-slate-500",
      )}>
        {isCredit ? "+" : "−"}{Math.abs(tx.amount)} pt
      </span>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon }: {
  label: string; value: number; icon: React.FC<{ className?: string }>
}) {
  return (
    <div className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl bg-slate-50 flex-1">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// ── User ID display with copy ─────────────────────────────────────────

function UserIdDisplay({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(userId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <User className="h-3 w-3" />
      <span className="font-mono">ID: {userId.slice(0, 12)}...</span>
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-slate-100 transition-colors"
        title="Copy User ID"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </div>
  )
}

// ── Editable avatar ───────────────────────────────────────────────────

interface EditableAvatarProps {
  avatarUrl: string | undefined
  displayName: string
  onImageChange: (imageUrl: string) => void
  isEditing: boolean
}

function EditableAvatar({ avatarUrl, displayName, onImageChange, isEditing }: EditableAvatarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type and size
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file")
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("Image size cannot exceed 5MB")
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) throw new Error("Upload failed")

      const data = await res.json()
      onImageChange(data.url)
    } catch (err) {
      console.error("Upload error:", err)
      alert("Upload failed, please try again")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }, [onImageChange])

  const initials = displayName.charAt(0).toUpperCase()

  return (
    <div className="relative">
      <div className={cn(
        "w-20 h-20 rounded-full overflow-hidden shrink-0",
        "ring-2 ring-slate-200 bg-slate-100",
        "flex items-center justify-center",
        isUploading && "opacity-50",
      )}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl font-semibold text-slate-400">
            {initials}
          </span>
        )}
      </div>

      {isEditing && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={cn(
              "absolute -bottom-1 -right-1 w-7 h-7 rounded-full",
              "bg-white shadow-md border border-slate-200",
              "flex items-center justify-center",
              "hover:bg-slate-50 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            title="Change Avatar"
          >
            <Camera className="h-3.5 w-3.5 text-slate-600" />
          </button>
        </>
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

// ── Editable name ─────────────────────────────────────────────────────

interface EditableNameEditorProps {
  initialName: string
  onSave: (name: string) => void
  onCancel: () => void
}

function EditableNameEditor({ initialName, onSave, onCancel }: EditableNameEditorProps) {
  const [editValue, setEditValue] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [])

  const handleSave = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== initialName) {
      onSave(trimmed)
    } else {
      onCancel()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      onCancel()
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleSave}
        className="h-8 text-lg font-bold w-auto min-w-[200px]"
        maxLength={50}
      />
      <button
        onClick={handleSave}
        className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 transition-colors"
        title="Save"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={onCancel}
        className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors"
        title="Cancel"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

interface EditableNameProps {
  name: string
  onSave: (name: string) => void
  isEditing: boolean
  onEditStart: () => void
  onEditCancel: () => void
}

function EditableName({ name, onSave, isEditing, onEditStart, onEditCancel }: EditableNameProps) {
  if (isEditing) {
    return (
      <EditableNameEditor
        key={name} // Force remount when name changes
        initialName={name}
        onSave={onSave}
        onCancel={onEditCancel}
      />
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <h1 className="text-xl font-bold truncate">{name}</h1>
      <button
        onClick={onEditStart}
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-all"
        title="Edit Name"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────

export function AccountPage({ onPricing }: { onPricing: () => void }) {
  const { data: session, update: updateSession } = useSession()
  const [me, setMe] = useState<UserMe | null>(null)
  const [txs, setTxs] = useState<TxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [debugOpen, setDebugOpen] = useState(false)

  // Edit states
  const [isEditingName, setIsEditingName] = useState(false)
  const [isEditingAvatar, setIsEditingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchUserData = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const res = await fetch("/api/user/me")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setMe(data.user)
      setTxs(data.transactions ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    fetchUserData()
  }, [fetchUserData])

  const handleSaveProfile = async (updates: { name?: string; image?: string }) => {
    if (!session?.user?.id) return

    setSaving(true)
    try {
      const res = await fetch("/api/user/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })

      if (!res.ok) throw new Error("Failed to update")

      const data = await res.json()

      // Update local state
      setMe((prev) => prev ? { ...prev, ...data.user } : null)

      // Update session to reflect changes across the app
      await updateSession({
        ...session,
        user: {
          ...session.user,
          name: data.user.name,
          image: data.user.image,
        },
      })

      // Dispatch custom event to notify UserAvatar to refresh
      window.dispatchEvent(new CustomEvent("user:profile:updated", {
        detail: { name: data.user.name, image: data.user.image }
      }))
    } catch (err) {
      console.error("Update error:", err)
      alert("Save failed, please try again")
    } finally {
      setSaving(false)
      setIsEditingName(false)
      setIsEditingAvatar(false)
    }
  }

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-sm text-muted-foreground">Please login</p>
      </div>
    )
  }

  const plan = me ? derivePlan(me.points) : "free"
  const displayName = me?.name ?? session.user.name ?? session.user.email ?? "User"
  const avatarUrl = me?.image ?? session.user.image ?? undefined

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">

      {/* ── Profile card ── */}
      <div className="flex items-start gap-5">
        {/* Avatar */}
        <EditableAvatar
          avatarUrl={avatarUrl}
          displayName={displayName}
          onImageChange={(imageUrl) => handleSaveProfile({ image: imageUrl })}
          isEditing={isEditingAvatar}
        />

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <EditableName
            name={displayName}
            onSave={(name) => handleSaveProfile({ name })}
            isEditing={isEditingName}
            onEditStart={() => setIsEditingName(true)}
            onEditCancel={() => setIsEditingName(false)}
          />
          <p className="text-sm text-muted-foreground truncate">
            {me?.email ?? session.user.email}
          </p>

          {/* User ID */}
          {me?.id && <UserIdDisplay userId={me.id} />}

          <div className="flex items-center gap-2 flex-wrap pt-1">
            <span className={cn(
              "text-xs font-semibold px-2.5 py-0.5 rounded-full",
              PLAN_STYLES[plan],
            )}>
              {PLAN_LABELS[plan]}
            </span>
            {me?.isCreator && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Creator
              </span>
            )}
          </div>
        </div>

        {/* Edit avatar toggle */}
        {!isEditingAvatar && !isEditingName && (
          <button
            onClick={() => setIsEditingAvatar(true)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            title="Edit Profile"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {isEditingAvatar && (
          <button
            onClick={() => setIsEditingAvatar(false)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            title="Done"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>

      <Separator />

      {/* ── Points ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Points Balance</h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onPricing}>
            <Zap className="h-3.5 w-3.5" />
            Top-up Points
            <ChevronRight className="h-3.5 w-3.5 -mr-1" />
          </Button>
        </div>

        {/* Balance display */}
        <div className="flex items-baseline gap-2">
          <PtIcon className="text-xl text-slate-400" />
          {loading ? (
            <div className="h-9 w-24 bg-slate-100 rounded animate-pulse" />
          ) : (
            <span className="text-4xl font-bold tabular-nums tracking-tight">
              {(me?.points ?? 0).toLocaleString()}
            </span>
          )}
          <span className="text-sm text-muted-foreground">pt</span>
        </div>

        {/* Transactions */}
        {txs.length > 0 && (
          <div className="rounded-xl border border-border/60 divide-y divide-border/60 overflow-hidden">
            {txs.map((tx) => (
              <div key={tx.id} className="px-4">
                <TxRow tx={tx} />
              </div>
            ))}
          </div>
        )}
        {!loading && txs.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">No transactions yet</p>
        )}
      </div>

      <Separator />

      {/* ── Stats ── */}
      <div>
        <h2 className="text-base font-semibold mb-4">Overview</h2>
        {loading ? (
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 h-20 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3">
            <StatCard label="Published Workflows" value={me?.templatesCount ?? 0} icon={GitBranch} />
            <StatCard label="Total Executions"   value={me?.executionsCount ?? 0} icon={Zap} />
            <StatCard label="Favorites"         value={me?.favoritesCount ?? 0} icon={Star} />
          </div>
        )}
      </div>

      {/* ── Subscriptions ── */}
      {(me?.subscriptions?.length ?? 0) > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-base font-semibold mb-4">Subscribed Creators</h2>
            <div className="space-y-2">
              {me!.subscriptions.map((sub) => (
                <div key={sub.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold shrink-0">
                    {sub.plan.creator.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {sub.plan.creator.name ?? "Unknown Creator"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sub.plan.name} · ${sub.plan.price}/mo
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">Active</Badge>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* ── Debug (temporary) ── */}
      <div>
        <button
          onClick={() => setDebugOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Code2 className="h-3.5 w-3.5" />
          Debug data
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", debugOpen && "rotate-180")} />
        </button>
        {debugOpen && (
          <pre className="mt-3 p-4 rounded-xl bg-slate-950 text-slate-300 text-[11px] leading-relaxed overflow-auto max-h-64 font-mono">
            {JSON.stringify({ session, me, txs }, null, 2)}
          </pre>
        )}
      </div>

      {/* ── Sign out ── */}
      <div className="pt-2 pb-8">
        <Button
          variant="ghost"
          size="sm"
          className="text-red-500 hover:text-red-600 hover:bg-red-50 gap-2"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>

    </div>
  )
}
