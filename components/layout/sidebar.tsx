"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"
import {
  MessageSquare,
  Search,
  Terminal,
  Send,
  Filter,
  X,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  isRunning?: boolean
}

export default function Sidebar({ isOpen, onClose, isRunning = false }: SidebarProps) {
  const [mode, setMode] = useState<'chat' | 'search'>('chat')
  const [isChatExpanded, setIsChatExpanded] = useState(false)
  const [inputText, setInputText] = useState("")
  const [chatHistory, setChatHistory] = useState<{ role: 'left' | 'right'; text: string }[]>([])
  const [isInitial, setIsInitial] = useState(true)

  // Force closed when running
  const effectiveOpen = isOpen && !isRunning

  const handleSend = async () => {
    if (!inputText.trim()) return
    if (isInitial) setIsInitial(false)

    const newUserMsg = { role: 'right' as const, text: inputText }
    setChatHistory(prev => [...prev, newUserMsg])
    setInputText("")
    setIsChatExpanded(true)

    if (mode === 'chat') {
      setChatHistory(prev => [...prev, { role: 'left', text: "Thinking..." }])
    }
  }

  return (
    <aside
      className={cn(
        "absolute left-0 top-0 bottom-0 z-20 w-[320px] flex flex-col",
        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "bg-white/60 backdrop-blur-md border-r border-slate-200/40",
        "shadow-2xl shadow-black/[0.06]",
        effectiveOpen
          ? "opacity-100 translate-x-0"
          : "opacity-0 -translate-x-full pointer-events-none",
      )}
    >

      {/* ── Logo (initial state only) ── */}
      <div className={cn(
        "flex flex-col items-center pt-12 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isInitial
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-20 pointer-events-none h-0 pt-0 overflow-hidden",
      )}>

        <div className="w-full max-w-[120px] h-[1.5px] bg-slate-900" />
        <h1
          className="text-2xl font-black tracking-tight text-slate-900 leading-none py-1"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}
        >
          RIFFLOW
        </h1>
        <div className="w-full max-w-[120px] h-[1.5px] bg-slate-900 mb-3" />
        <div className="flex items-baseline gap-1">
          <span
            className="text-2xl text-blue-600 font-normal"
            style={{
              fontFamily: "'Dancing Script', 'Brush Script MT', cursive",
              transform: "rotate(-2deg) translateX(2px)",
              display: "inline-block",
            }}
          >
            Workflow
          </span>
          <span className="text-[10px] font-bold tracking-tighter text-slate-500 italic">Studio</span>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Filter bar */}
        <div className={cn(
          "px-2 py-2 flex items-center justify-between border-b border-slate-200/30 transition-opacity duration-300",
          isInitial ? "opacity-0 pointer-events-none" : "opacity-100",
        )}>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors outline-none">
              <Filter size={12} />
              Filter
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[210px] ml-4 animate-in fade-in zoom-in-95 duration-200">
              <DropdownMenuItem>
                Sort by Name <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                Recent Active <DropdownMenuShortcut>⇧⌘N</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                Type: KG Entity <DropdownMenuShortcut>⌥⌘N</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Filter by Tag</DropdownMenuItem>
              <DropdownMenuItem className="text-red-600 focus:text-red-600">
                Clear Filters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Nodes list */}
        <div className={cn(
          "flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar transition-opacity duration-200",
          isInitial ? "opacity-0 pointer-events-none" : "opacity-100",
        )}>
          <div className="h-20 w-full bg-slate-200/20 rounded-lg animate-pulse" />
        </div>

        {/* Chat history */}
        <div className={cn(
          "bg-transparent overflow-y-auto transition-all duration-500 ease-in-out custom-scrollbar",
          isInitial ? "delay-[400ms]" : "delay-0",
          isChatExpanded && !isInitial
            ? "h-[58%] border-t border-slate-200/50 px-4 py-6"
            : "h-0",
        )}>
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col mb-8 last:mb-2",
                msg.role === 'right' ? "items-end text-right" : "items-start text-left",
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 mb-2">
                {msg.role === 'right' ? "You" : "Formula AI"}
              </span>
              <div className={cn(
                "text-sm leading-relaxed max-w-[90%] transition-all",
                msg.role === 'right'
                  ? "text-blue-600 font-medium"
                  : "text-slate-800 font-normal",
              )}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div className={cn(
          "p-2 bg-white/40 transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          isInitial ? "-translate-y-[140%]" : "translate-y-0",
        )}>
          {/* Initial headline */}
          <div className={cn(
            "text-center mb-6 transition-all duration-500",
            isInitial
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-4 pointer-events-none h-0 mb-0",
          )}>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">How can I help?</h1>
            <p className="text-[10px] text-slate-400 mt-1">Search nodes or ask AI anything</p>
          </div>

          {/* Input box */}
          <div className="relative bg-white rounded-2xl border border-slate p-2 flex flex-col">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={mode === 'chat' ? "Ask AI..." : "Search..."}
              className="w-full outline-none resize-none border-none focus:ring-0 text-sm py-2 px-2 bg-transparent min-h-[60px]"
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
              <div className="flex gap-1">
                <button
                  onClick={() => setIsChatExpanded(!isChatExpanded)}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isChatExpanded ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:text-slate-600",
                  )}
                >
                  <MessageSquare size={16} />
                </button>
                <button
                  className="p-1.5 text-slate-400 hover:text-slate-600"
                  onClick={() => setMode(mode === 'chat' ? 'search' : 'chat')}
                >
                  {mode === 'chat' ? <Terminal size={16} /> : <Search size={16} />}
                </button>
              </div>
              <button
                onClick={handleSend}
                disabled={!inputText.trim()}
                className="bg-blue-600 text-white p-2 rounded-xl disabled:opacity-30 transition-all hover:scale-105 shadow-md shadow-blue-200"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </aside>
  )
}