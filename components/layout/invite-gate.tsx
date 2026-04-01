"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { cn } from "@/lib/utils"

export default function InviteGate() {
  const { data: session, update } = useSession()
  const [inviteCode, setInviteCode] = useState("")
  const [error, setError]           = useState("")
  const [loading, setLoading]       = useState(false)

  // Only show for authenticated but unverified users
  if (!session || session.user.inviteVerified) return null

  const handleSubmit = async () => {
    if (!inviteCode.trim()) return
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/verify-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: inviteCode.trim() }),
    })

    if (res.ok) {
      // Trigger session refresh so inviteVerified becomes true
      await update()
    } else {
      setError("Invalid invite code. DM the author on GitHub to get one.")
    }
    setLoading(false)
  }

  return (
    <Dialog open>
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[380px] w-full [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Invite code required</DialogTitle></VisuallyHidden>

        <div className="w-full rounded-[28px] bg-white border border-slate-100 shadow-2xl shadow-black/[0.10] px-8 pt-10 pb-8 flex flex-col items-center gap-5">
          <div className="text-center space-y-1.5">
            <p
              className="text-[38px] tracking-tight text-slate-800 leading-none mb-4"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400, fontStyle: "italic" }}
            >
              Hi, composer
            </p>
            <h1 className="text-[17px] font-semibold tracking-tight text-slate-800">Enter your invite code</h1>
            <p className="text-[13px] text-slate-500">
              Rifflow is currently in early access.{" "}
              <a
                href="https://github.com/yh161/rifflow"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-slate-700"
              >
                DM me on GitHub
              </a>{" "}
              to get one.
            </p>
          </div>

          <div className="w-full flex flex-col gap-3">
            <Input
              type="text"
              placeholder="Invite code"
              value={inviteCode}
              onChange={(e) => { setInviteCode(e.target.value); setError("") }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="h-11 rounded-xl border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300"
            />
            {error && <p className="text-[11px] text-red-400 pl-1">{error}</p>}

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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
