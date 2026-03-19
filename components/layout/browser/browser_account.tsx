"use client"

import { useEffect, useState } from "react"
import { useSession, signOut } from "next-auth/react"
import {
  LogOut, ChevronRight, ChevronDown,
  Zap, Star, GitBranch, Code2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { PtIcon } from "@/components/layout/user-avatar"

// ── Types ─────────────────────────────────────────────────────────────────

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

// ── Plan badge ─────────────────────────────────────────────────────────────

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

// ── Transaction row ────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: TxItem }) {
  const isCredit = tx.amount > 0
  const label = (tx.metadata as { label?: string } | null)?.label
    ?? (tx.type === "topup" ? "积分充值"
      : tx.type === "execution" ? "执行工作流"
      : tx.type === "refund"   ? "退款"
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

// ── Stat card ──────────────────────────────────────────────────────────────

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

// ── Main component ─────────────────────────────────────────────────────────

export function AccountPage({ onPricing }: { onPricing: () => void }) {
  const { data: session } = useSession()
  const [me, setMe] = useState<UserMe | null>(null)
  const [txs, setTxs] = useState<TxItem[]>([])
  const [loading, setLoading] = useState(true)
  const [debugOpen, setDebugOpen] = useState(false)

  useEffect(() => {
    if (!session?.user?.id) return
    fetch("/api/user/me")
      .then((r) => r.json())
      .then((d) => {
        setMe(d.user)
        setTxs(d.transactions ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [session?.user?.id])

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-sm text-muted-foreground">请先登录</p>
      </div>
    )
  }

  const plan = me ? derivePlan(me.points) : "free"
  const displayName = me?.name ?? session.user.name ?? session.user.email ?? "User"
  const avatarUrl = me?.image ?? session.user.image ?? undefined

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-8">

      {/* ── Profile card ── */}
      <div className="flex items-center gap-5">
        {/* Avatar */}
        <div className={cn(
          "w-20 h-20 rounded-full overflow-hidden shrink-0",
          "ring-2 ring-slate-200 bg-slate-100",
          "flex items-center justify-center",
        )}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl font-semibold text-slate-400">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <h1 className="text-xl font-bold truncate">{displayName}</h1>
          <p className="text-sm text-muted-foreground truncate">{me?.email ?? session.user.email}</p>
          <div className="flex items-center gap-2 flex-wrap">
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
      </div>

      <Separator />

      {/* ── Credits ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">积分余额</h2>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onPricing}>
            <Zap className="h-3.5 w-3.5" />
            充值积分
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
          <p className="text-xs text-muted-foreground py-2">暂无交易记录</p>
        )}
      </div>

      <Separator />

      {/* ── Stats ── */}
      <div>
        <h2 className="text-base font-semibold mb-4">数据概览</h2>
        {loading ? (
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex-1 h-20 rounded-2xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex gap-3">
            <StatCard label="已发布工作流" value={me?.templatesCount ?? 0} icon={GitBranch} />
            <StatCard label="总执行次数"   value={me?.executionsCount ?? 0} icon={Zap} />
            <StatCard label="收藏"         value={me?.favoritesCount ?? 0} icon={Star} />
          </div>
        )}
      </div>

      {/* ── Subscriptions ── */}
      {(me?.subscriptions?.length ?? 0) > 0 && (
        <>
          <Separator />
          <div>
            <h2 className="text-base font-semibold mb-4">订阅的创作者</h2>
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
                      {sub.plan.name} · ${sub.plan.price}/月
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
          退出登录
        </Button>
      </div>

    </div>
  )
}
