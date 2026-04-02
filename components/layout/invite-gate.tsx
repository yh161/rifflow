"use client"

import { useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function InviteGate() {
  const { data: session, update } = useSession()
  const [inviteCode, setInviteCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Only show for new Google users that need invite verification
  if (!session?.user?.needsInvite) return null

  const handleSubmit = async () => {
    if (!inviteCode.trim() || loading) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/auth/verify-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      })
      if (res.ok) {
        await update({ inviteValidated: true })
      } else {
        setError("Invalid invite code. DM the author on GitHub to get one.")
      }
    } catch {
      setError("Network error, please try again")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-[28px] px-8 py-10 w-full max-w-[360px] shadow-2xl shadow-black/10 border border-slate-100 flex flex-col gap-5">
        <div className="text-center space-y-1.5">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-800">Invite code required</h1>
          <p className="text-[13px] text-slate-500">Enter an invite code to continue</p>
        </div>

        <div className="flex flex-col gap-3">
          <Input
            type="text"
            placeholder="Enter invite code"
            value={inviteCode}
            onChange={(e) => { setInviteCode(e.target.value); setError("") }}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
            className={cn(
              "h-11 rounded-xl border-slate-200 text-[13px] text-slate-700",
              "placeholder:text-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300",
              error && "border-red-300 focus-visible:ring-red-200",
            )}
          />
          {error && <p className="text-[11px] text-red-400 pl-1">{error}</p>}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!inviteCode.trim() || loading}
          className={cn(
            "w-full h-11 rounded-xl text-[13px] font-medium transition-all duration-200",
            inviteCode.trim() && !loading
              ? "bg-slate-800 hover:bg-slate-700 text-white"
              : "bg-slate-100 text-slate-300 cursor-not-allowed pointer-events-none",
          )}
        >
          {loading ? "Verifying…" : "Continue"}
        </Button>

        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors text-center"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
