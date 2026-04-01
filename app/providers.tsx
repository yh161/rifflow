"use client"

import { useEffect } from "react"
import { SessionProvider } from "next-auth/react"

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey) e.preventDefault()
    }
    document.addEventListener("wheel", handler, { passive: false })
    return () => document.removeEventListener("wheel", handler)
  }, [])

  return <SessionProvider>{children}</SessionProvider>
}