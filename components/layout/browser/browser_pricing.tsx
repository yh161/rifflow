"use client"

import { useState } from "react"
import { Check, Zap, Sparkles, Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { PtIcon } from "@/components/layout/user-avatar"

// ── Credit packs ───────────────────────────────────────────────────────────

const CREDIT_PACKS = [
  { points: 100,  price: 6,   label: "Starter" },
  { points: 500,  price: 28,  label: "Standard", popular: false },
  { points: 2000, price: 98,  label: "Advanced", popular: true },
  { points: 5000, price: 228, label: "Pro" },
]

// ── Subscription plans ─────────────────────────────────────────────────────

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: 0,
    unit: "",
    color: "border-border",
    headerColor: "bg-slate-50",
    badge: null,
    pointsPerMonth: 100,
    features: [
      "100 points per month",
      "Community templates browsing",
      "Basic workflow execution",
      "Standard response speed",
    ],
    cta: "Current Plan",
    ctaDisabled: true,
    icon: ({ className }: { className?: string }) => <PtIcon className={className} />,
  },
  {
    key: "pro",
    name: "Pro",
    price: 49,
    unit: "/month",
    color: "border-blue-500",
    headerColor: "bg-blue-500",
    badge: "Popular",
    pointsPerMonth: 2000,
    features: [
      "2,000 points per month (no expiration)",
      "Priority execution queue",
      "Access to all templates",
      "Creator features unlocked",
      "High-speed response",
    ],
    cta: "Upgrade to Pro",
    ctaDisabled: false,
    icon: Sparkles,
  },
  {
    key: "max",
    name: "Max",
    price: 149,
    unit: "/month",
    color: "border-violet-500",
    headerColor: "bg-violet-600",
    badge: "Best",
    pointsPerMonth: 8000,
    features: [
      "8,000 points per month (no expiration)",
      "Highest priority execution queue",
      "Access to all templates + Early access",
      "Creator Pro features",
      "Dedicated API quota",
      "Exclusive customer support",
    ],
    cta: "Upgrade to Max",
    ctaDisabled: false,
    icon: Crown,
  },
]

// ── Credit pack card ────────────────────────────────────────────────────────

function PackCard({
  pack,
  selected,
  onClick,
}: {
  pack: typeof CREDIT_PACKS[number]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1 p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md",
        selected
          ? "border-blue-500 bg-blue-50 shadow-md"
          : "border-border bg-white hover:border-slate-300",
      )}
    >
      {pack.popular && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500 text-white whitespace-nowrap">
          Recommended
        </span>
      )}
      <PtIcon className={cn("text-xl", selected ? "text-blue-500" : "text-slate-400")} />
      <span className={cn("text-xl font-bold tabular-nums", selected ? "text-blue-600" : "text-foreground")}>
        {pack.points.toLocaleString()}
        <span className="text-sm font-normal ml-0.5">pt</span>
      </span>
      <span className="text-xs text-muted-foreground">{pack.label}</span>
      <span className={cn(
        "mt-1 text-sm font-semibold",
        selected ? "text-blue-500" : "text-slate-700",
      )}>
        ¥{pack.price}
      </span>
    </button>
  )
}

// ── Subscription plan card ──────────────────────────────────────────────────

function PlanCard({ plan, current }: { plan: typeof PLANS[number]; current?: boolean }) {
  const Icon = plan.icon
  return (
    <div className={cn(
      "relative flex flex-col rounded-2xl border-2 overflow-hidden",
      current ? "border-blue-500 shadow-lg shadow-blue-100" : plan.color,
    )}>
      {/* Header */}
      <div className={cn(
        "px-5 py-4",
        plan.key === "free" ? "bg-slate-50" : plan.headerColor,
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn(
              "h-4 w-4",
              plan.key === "free" ? "text-slate-500" : "text-white",
            )} />
            <span className={cn(
              "font-bold text-base",
              plan.key === "free" ? "text-slate-700" : "text-white",
            )}>
              {plan.name}
            </span>
          </div>
          {plan.badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white">
              {plan.badge}
            </span>
          )}
        </div>
        <div className={cn("mt-2", plan.key === "free" ? "text-slate-700" : "text-white")}>
          <span className="text-3xl font-bold">
            {plan.price === 0 ? "Free" : `¥${plan.price}`}
          </span>
          {plan.unit && (
            <span className="text-sm opacity-80 ml-1">{plan.unit}</span>
          )}
        </div>
        <p className={cn(
          "text-xs mt-1 opacity-80",
          plan.key === "free" ? "text-slate-500" : "text-white",
        )}>
          {plan.pointsPerMonth.toLocaleString()} points per month, no expiration
        </p>
      </div>

      {/* Features */}
      <div className="px-5 py-4 bg-white flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <div key={f} className="flex items-start gap-2">
            <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
            <span className="text-sm text-slate-600">{f}</span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="px-5 pb-5 bg-white">
        <Button
          className="w-full"
          size="sm"
          variant={plan.key === "free" ? "outline" : "default"}
          disabled={plan.ctaDisabled}
          onClick={() => {
            // Stripe integration placeholder
            if (!plan.ctaDisabled) {
              alert("Stripe payment integration coming soon")
            }
          }}
        >
          {plan.cta}
        </Button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function PricingPage() {
  const [selectedPack, setSelectedPack] = useState<number | null>(null)

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-10">

      {/* ── Page header ── */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Pricing Plans</h1>
        <p className="text-muted-foreground text-sm">
          Points never expire. Pay as you go. Subscription plans can be canceled anytime.
        </p>
      </div>

      {/* ── Subscription plans ── */}
      <div>
        <h2 className="text-lg font-semibold mb-5">Subscription Plans</h2>
        <div className="grid grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <PlanCard key={plan.key} plan={plan} />
          ))}
        </div>
      </div>

      <Separator />

      {/* ── Credit top-up ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Points Top-up</h2>
          <Badge variant="outline" className="text-xs gap-1">
            <PtIcon className="text-xs" />
            One-time purchase, valid forever
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          No subscription required, buy points on demand
        </p>

        <div className="grid grid-cols-4 gap-3">
          {CREDIT_PACKS.map((pack, i) => (
            <PackCard
              key={pack.points}
              pack={pack}
              selected={selectedPack === i}
              onClick={() => setSelectedPack(selectedPack === i ? null : i)}
            />
          ))}
        </div>

        {selectedPack !== null && (
          <div className="mt-4 flex items-center justify-between p-4 rounded-2xl bg-blue-50 border border-blue-200">
            <div>
              <p className="font-semibold text-sm">
                {CREDIT_PACKS[selectedPack].points.toLocaleString()} Points
                <span className="text-muted-foreground font-normal ml-2">
                  · {CREDIT_PACKS[selectedPack].label}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Valid forever after purchase, no time limit
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => alert("Stripe payment integration coming soon")}
            >
              <Zap className="h-3.5 w-3.5" />
              Pay ¥{CREDIT_PACKS[selectedPack].price}
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* ── FAQ / Notes ── */}
      <div className="space-y-3 pb-8">
        <h2 className="text-base font-semibold">FAQ</h2>
        {[
          ["Do points expire?", "No. Both purchased points and subscription bonus points never expire."],
          ["Can I cancel subscription anytime?", "Yes. After cancellation, remaining points for the current month can still be used. No renewal next month."],
          ["How are points consumed?", "Free templates don't consume points; pay-per-use templates deduct points as set by creators; subscription-exclusive templates are free for subscribers."],
          ["What payment methods are supported?", "WeChat Pay, Alipay supported; credit card integration coming soon."],
        ].map(([q, a]) => (
          <div key={q} className="space-y-1">
            <p className="text-sm font-medium">{q}</p>
            <p className="text-sm text-muted-foreground">{a}</p>
          </div>
        ))}
      </div>

    </div>
  )
}
