"use client"

import React, { useState, useRef } from "react"
import { signIn } from "next-auth/react"
import { cn } from "@/lib/utils"
import { X, ArrowLeft, Eye, EyeOff } from "lucide-react"
import { Turnstile } from "@marsidev/react-turnstile"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

// ─────────────────────────────────────────────
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

// ─────────────────────────────────────────────
// Shared Continue button
// ─────────────────────────────────────────────
function ContinueButton({ onClick, enabled, label = "Continue" }: {
  onClick: () => void
  enabled: boolean
  label?: string
}) {
  return (
    <Button
      onClick={onClick}
      disabled={!enabled}
      className={cn(
        "w-full h-11 rounded-xl text-[13px] font-medium transition-all duration-200",
        enabled
          ? "bg-slate-800 hover:bg-slate-700 text-white"
          : "bg-slate-100 text-slate-300 cursor-not-allowed pointer-events-none",
      )}
    >
      {label}
    </Button>
  )
}

interface LoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const [view,         setView]         = useState<"providers" | "email">("providers")
  const [email,        setEmail]        = useState("")
  const [emailError,   setEmailError]   = useState("")
  const [password,     setPassword]     = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileRef = useRef<any>(null)

  const handleOpenChange = (val: boolean) => {
    if (!val) {
      setView("providers"); setEmail(""); setPassword("")
      setEmailError(""); setCaptchaToken(null)
    }
    onOpenChange(val)
  }

  const goEmail = () => {
    if (!isValidEmail(email)) { setEmailError("Please enter a valid email address"); return }
    setEmailError("")
    setView("email")
  }

  const [submitError, setSubmitError] = useState("")
  const canSubmit = isValidEmail(email) && password.length >= 6 && !!captchaToken

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitError("")

    // 先尝试注册（如果用户已存在，接口会返回 exists: true）
    const reg = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const regData = await reg.json()
    if (!reg.ok && !regData.exists) {
      setSubmitError("Registration failed, please try again")
      return
    }

    // 注册成功或用户已存在，直接登录
    const result = await signIn("credentials", { email, password, redirect: false })
    if (result?.error) {
      setSubmitError("Invalid email or password")
    } else {
      handleOpenChange(false)
    }
  }

  const isEmail = view === "email"

  // View transition: both sit in the same CSS grid cell.
  // Container auto-sizes to the VISIBLE child; invisible child is
  // pointer-events:none so it doesn't intercept clicks.
  const viewStyle = (active: boolean, goesLeft: boolean): React.CSSProperties => ({
    gridRow:       1,
    gridColumn:    1,
    opacity:       active ? 1 : 0,
    transform:     active ? "translateX(0)" : `translateX(${goesLeft ? "-20px" : "20px"})`,
    transition:    "opacity 0.25s ease, transform 0.25s cubic-bezier(0.16,1,0.3,1)",
    pointerEvents: active ? "auto" : "none",
    // Keep invisible view out of tab order
    visibility:    active ? "visible" : "hidden",
  })

  const iconBtn = "absolute top-4 z-10 w-7 h-7 rounded-full flex items-center justify-center bg-black/5 hover:bg-black/10 text-slate-400 hover:text-slate-600 transition-colors duration-150 outline-none"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 border-none bg-transparent shadow-none max-w-[380px] w-full [&>button]:hidden">
        <VisuallyHidden><DialogTitle>Sign in</DialogTitle></VisuallyHidden>

        <div className="w-full rounded-[28px] bg-white border border-slate-100 shadow-2xl shadow-black/[0.10] overflow-hidden">
          {/*
            CSS grid: both children occupy [row 1 / col 1].
            Container height = height of the current "in-flow" child
            (the visible one, since invisible is visibility:hidden but
            still participates in layout — giving us the natural height).
            We force the inactive view to height:0 so it doesn't stretch the card.
          */}
          <div style={{ display: "grid" }}>

            {/* ── View 1: providers ── */}
            <div style={{
              ...viewStyle(!isEmail, true),
              // Collapse inactive view so it doesn't add height
              ...(!isEmail ? {} : { height: 0, overflow: "hidden" }),
            }}>
              <div className="relative px-8 pt-10 pb-8 flex flex-col items-center gap-5">
                <button onClick={() => handleOpenChange(false)} className={cn(iconBtn, "right-4")}>
                  <X size={13} strokeWidth={2} />
                </button>

                <div className="text-center space-y-1.5">
                  <p
                    className="text-[38px] tracking-tight text-slate-800 leading-none mb-6"
                    style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 400, fontStyle: "italic" }}
                  >
                    Hi, composer
                  </p>
                  <h1 className="text-[17px] font-semibold tracking-tight text-slate-800">Sign in / Sign up</h1>
                  <p className="text-[13px] text-slate-500">Choose how you'd like to continue</p>
                </div>

                <div className="w-full flex flex-col gap-4">
                  <Button
                    variant="outline"
                    onClick={() => signIn("google", { callbackUrl: "/" })}
                    className="w-full h-11 rounded-xl gap-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-[13px] font-medium text-slate-700 shadow-sm transition-all duration-150"
                  >
                    <GoogleLogo />
                    Continue with Google
                  </Button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-[11px] text-slate-400 select-none">or</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>

                  <div className="flex flex-col gap-1">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setEmailError("") }}
                      onKeyDown={(e) => e.key === "Enter" && goEmail()}
                      onBlur={() => { if (email && !isValidEmail(email)) setEmailError("Please enter a valid email address") }}
                      className={cn(
                        "h-11 rounded-xl border-slate-200 text-[13px] text-slate-700",
                        "placeholder:text-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300",
                        emailError && "border-red-300 focus-visible:ring-red-200",
                      )}
                    />
                    {emailError && <p className="text-[11px] text-red-400 pl-1">{emailError}</p>}
                  </div>

                  <ContinueButton onClick={goEmail} enabled={isValidEmail(email)} label="Continue with Email" />
                </div>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  By continuing, you agree to our{" "}
                  <a href="#" className="underline underline-offset-2 hover:text-slate-600 transition-colors">Terms</a>
                  {" "}and{" "}
                  <a href="#" className="underline underline-offset-2 hover:text-slate-600 transition-colors">Privacy Policy</a>
                </p>
              </div>
            </div>

            {/* ── View 2: email + password ── */}
            <div style={{
              ...viewStyle(isEmail, false),
              ...(!isEmail ? { height: 0, overflow: "hidden" } : {}),
            }}>
              <div className="relative px-8 pt-10 pb-8 flex flex-col gap-5">
                <button onClick={() => setView("providers")} className={cn(iconBtn, "left-4")}>
                  <ArrowLeft size={13} strokeWidth={2} />
                </button>
                <button onClick={() => handleOpenChange(false)} className={cn(iconBtn, "right-4")}>
                  <X size={13} strokeWidth={2} />
                </button>

                <div className="text-center space-y-1.5">
                  <h1 className="text-[17px] font-semibold tracking-tight text-slate-800">Email sign in</h1>
                  <p className="text-[13px] text-slate-500">New users are registered automatically</p>
                </div>

                <div className="flex flex-col gap-3">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300"
                  />

                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password (min. 6 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                      className="h-11 rounded-xl border-slate-200 text-[13px] text-slate-700 placeholder:text-slate-300 focus-visible:ring-1 focus-visible:ring-slate-300 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors outline-none"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA"}
                      onSuccess={(token) => setCaptchaToken(token)}
                      onExpire={() => setCaptchaToken(null)}
                      options={{ theme: "light", size: "normal" }}
                    />
                  </div>
                  {submitError && (
                    <p className="text-[11px] text-red-400 text-center">{submitError}</p>
                  )}
                </div>

                <ContinueButton onClick={handleSubmit} enabled={canSubmit} />
              </div>
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}