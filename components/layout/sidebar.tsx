"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
  ArrowLeft, Send, Bot, Info, Plus, ChevronDown,
  UserPlus, Cpu, X, Sparkles, Trash2, Users,
} from "lucide-react"
import { TEXT_MODELS } from "@/lib/models"

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface RoomMember {
  id: string
  name: string | null
  image: string | null
  role: string
}

interface RoomSummary {
  id: string
  name: string | null
  updatedAt: string
  members: RoomMember[]
  lastMessage: {
    content: string
    createdAt: string
    isMe: boolean
    isAI: boolean
    senderName: string | null
  } | null
  unreadCount: number
}

interface ChatMessage {
  id: string
  content: string
  createdAt: string
  isMe: boolean
  isAI: boolean
  aiModel?: string | null
  senderId: string | null
  senderName: string | null
  senderImage: string | null
}

interface RoomDetail extends RoomSummary {
  messages: ChatMessage[]
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
  isRunning?: boolean
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function getRoomDisplayName(room: RoomSummary, meId: string): string {
  if (room.name) return room.name
  const others = room.members.filter(m => m.id !== meId)
  if (others.length === 0) return "My Space"
  if (others.length === 1) return others[0].name ?? "Unknown"
  return others.map(m => m.name?.split(" ")[0] ?? "?").join(", ")
}

function MemberAvatar({ member, className }: {
  member: { name?: string | null; image?: string | null }
  className?: string
}) {
  if (member.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.image} alt="" className={cn("rounded-full object-cover", className)} />
  }
  return (
    <div className={cn("rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-semibold", className)}>
      {(member.name ?? "?")[0].toUpperCase()}
    </div>
  )
}

function RoomAvatar({ room, meId, className }: { room: RoomSummary; meId: string; className?: string }) {
  const others = room.members.filter(m => m.id !== meId)
  if (others.length === 0) {
    return (
      <div className={cn("rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white", className)}>
        <Bot size={16} />
      </div>
    )
  }
  if (others.length === 1) return <MemberAvatar member={others[0]} className={className} />
  return (
    <div className={cn("rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center text-white", className)}>
      <Users size={16} />
    </div>
  )
}

// ─────────────────────────────────────────────
// RoomItem
// ─────────────────────────────────────────────

function RoomItem({ room, active, meId, onClick }: {
  room: RoomSummary; active: boolean; meId: string; onClick: () => void
}) {
  const displayName = getRoomDisplayName(room, meId)
  const last = room.lastMessage
  return (
    <button
      className={cn("w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors text-left", active && "bg-blue-50/70")}
      onClick={onClick}
    >
      <div className="relative flex-shrink-0">
        <RoomAvatar room={room} meId={meId} className="w-10 h-10 text-sm" />
        {room.unreadCount > 0 && <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm truncate", room.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
            {displayName}
          </span>
          {last && <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1.5">{formatTime(last.createdAt)}</span>}
        </div>
        <p className={cn("text-xs truncate mt-0.5", room.unreadCount > 0 ? "text-slate-600" : "text-slate-400")}>
          {last
            ? last.isAI
              ? <><span className="text-violet-400">AI: </span>{last.content}</>
              : last.isMe
              ? <><span className="text-slate-400">You: </span>{last.content}</>
              : last.content
            : <span className="italic">No messages yet</span>}
        </p>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────
// Main Sidebar
// ─────────────────────────────────────────────

export default function Sidebar({ isOpen, onClose, isRunning = false }: SidebarProps) {
  const { data: session } = useSession()
  const meId = session?.user?.id ?? ""

  const [isInitial, setIsInitial] = useState(true)
  const [view, setView] = useState<"list" | "new" | "chat" | "detail">("list")

  // Room list
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)

  // Active room
  const [activeRoom, setActiveRoom] = useState<RoomDetail | null>(null)
  const [messagesLoading, setMessagesLoading] = useState(false)

  // Chat input
  const [inputText, setInputText] = useState("")
  const [sending, setSending] = useState(false)

  // AI settings stored per-room so they persist when navigating between rooms
  const [roomAiSettings, setRoomAiSettings] = useState<Record<string, { agentMode: boolean; model: string }>>({})
  const [modelDropOpen, setModelDropOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  // Derived per-room AI state
  const currentRoomId = activeRoom?.id ?? ""
  const agentMode = roomAiSettings[currentRoomId]?.agentMode ?? false
  const selectedModel = roomAiSettings[currentRoomId]?.model ?? TEXT_MODELS[0].id

  const setAgentMode = (val: boolean | ((prev: boolean) => boolean)) => {
    setRoomAiSettings(prev => {
      const curr = prev[currentRoomId] ?? { agentMode: false, model: TEXT_MODELS[0].id }
      const next = typeof val === "function" ? val(curr.agentMode) : val
      return { ...prev, [currentRoomId]: { ...curr, agentMode: next } }
    })
  }
  const setSelectedModel = (model: string) => {
    setRoomAiSettings(prev => {
      const curr = prev[currentRoomId] ?? { agentMode: false, model: TEXT_MODELS[0].id }
      return { ...prev, [currentRoomId]: { ...curr, model } }
    })
  }

  // New room form
  const [newRoomName, setNewRoomName] = useState("")
  const [creating, setCreating] = useState(false)

  // Detail: add member
  const [addMemberId, setAddMemberId] = useState("")
  const [addMemberLoading, setAddMemberLoading] = useState(false)
  const [addMemberError, setAddMemberError] = useState("")

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const effectiveOpen = isOpen && !isRunning
  const displayModelName = TEXT_MODELS.find(m => m.id === selectedModel)?.name ?? selectedModel

  // ── Fetch room list ──────────────────────────────────────────
  const fetchRooms = useCallback(async () => {
    try {
      const r = await fetch("/api/rooms")
      if (!r.ok) return
      const data = await r.json()
      if (data?.rooms) setRooms(data.rooms)
    } catch {}
  }, [])

  useEffect(() => {
    if (!effectiveOpen) return
    fetchRooms().finally(() => setRoomsLoading(false))
    const id = setInterval(fetchRooms, 5000)
    return () => clearInterval(id)
  }, [effectiveOpen, fetchRooms])

  // ── Poll active room messages ────────────────────────────────
  const fetchRoomMessages = useCallback(async (roomId: string) => {
    try {
      const r = await fetch(`/api/rooms/${roomId}`)
      if (!r.ok) return
      const data = await r.json()
      if (!data?.room) return
      setActiveRoom(prev => {
        if (!prev || prev.id !== roomId) return prev
        const prevLastId = prev.messages.at(-1)?.id
        const nextLastId = data.room.messages.at(-1)?.id
        if (prev.messages.length === data.room.messages.length && prevLastId === nextLastId) return prev
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
        return { ...data.room }
      })
    } catch {}
  }, [])

  useEffect(() => {
    if (!activeRoom) return
    const roomId = activeRoom.id
    const id = setInterval(() => fetchRoomMessages(roomId), 3000)
    return () => clearInterval(id)
  }, [activeRoom?.id, fetchRoomMessages])

  // ── Legacy sidebar:openChat event ───────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ contactId: string }>).detail
      if (detail?.contactId === "__inbox__") { setIsInitial(false); setView("list") }
    }
    window.addEventListener("sidebar:openChat", handler)
    return () => window.removeEventListener("sidebar:openChat", handler)
  }, [])

  // ── Open a room ──────────────────────────────────────────────
  const openRoom = async (room: RoomSummary) => {
    setIsInitial(false)
    setActiveRoom({ ...room, messages: [] })
    setInputText("")
    setView("chat")
    setMessagesLoading(true)
    try {
      const r = await fetch(`/api/rooms/${room.id}`)
      const data = await r.json()
      if (data?.room) {
        setActiveRoom(data.room)
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
      }
    } catch {}
    finally { setMessagesLoading(false) }
  }

  // ── Create new room ──────────────────────────────────────────
  const handleCreateRoom = async () => {
    if (creating) return
    setCreating(true)
    try {
      const r = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRoomName.trim() || null }),
      })
      if (r.ok) {
        const data = await r.json()
        setNewRoomName("")
        await fetchRooms()
        if (data?.room) openRoom(data.room)
      }
    } catch {}
    finally { setCreating(false) }
  }

  // ── Send message ─────────────────────────────────────────────
  const handleSend = async () => {
    if (!activeRoom || !inputText.trim() || sending || aiLoading) return
    const content = inputText.trim()
    setInputText("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
    setSending(true)
    try {
      const r = await fetch(`/api/rooms/${activeRoom.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!r.ok) { setInputText(content); return }
      const { message } = await r.json()

      setActiveRoom(prev => prev ? { ...prev, messages: [...prev.messages, message] } : prev)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80)

      setRooms(prev =>
        prev.map(rm => rm.id === activeRoom.id
          ? { ...rm, lastMessage: { content, createdAt: message.createdAt, isMe: true, isAI: false, senderName: null }, updatedAt: message.createdAt }
          : rm
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      )

      // AI reply — saved to DB, visible to everyone in the room
      if (agentMode) {
        setAiLoading(true)
        try {
          const isGroup = activeRoom.members.length > 2
          const history = [...(activeRoom.messages), message]
            .map(m => {
              if (m.isAI) return { role: "assistant" as const, content: m.content }
              // In group chats, prefix each human message with sender name so AI knows who said what
              const prefix = isGroup
                ? `[${m.isMe ? "Me" : (m.senderName ?? "User")}]: `
                : ""
              return { role: "user" as const, content: prefix + m.content }
            })

          const aiR = await fetch(`/api/rooms/${activeRoom.id}/ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: selectedModel, messages: history }),
          })
          if (aiR.ok) {
            const { message: aiMsg } = await aiR.json()
            setActiveRoom(prev => prev ? { ...prev, messages: [...prev.messages, aiMsg] } : prev)
            setRooms(prev => prev.map(rm => rm.id === activeRoom.id
              ? { ...rm, lastMessage: { content: aiMsg.content, createdAt: aiMsg.createdAt, isMe: false, isAI: true, senderName: null }, updatedAt: aiMsg.createdAt }
              : rm
            ))
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
          }
        } catch {}
        finally { setAiLoading(false) }
      }
    } finally { setSending(false) }
  }

  // ── Add member ───────────────────────────────────────────────
  const handleAddMember = async () => {
    if (!activeRoom || !addMemberId.trim() || addMemberLoading) return
    setAddMemberLoading(true)
    setAddMemberError("")
    try {
      const r = await fetch(`/api/rooms/${activeRoom.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: addMemberId.trim() }),
      })
      const data = await r.json()
      if (r.ok && data.member) {
        setActiveRoom(prev => prev ? { ...prev, members: [...prev.members, data.member] } : prev)
        setAddMemberId("")
      } else {
        setAddMemberError(data.error ?? "Failed to add member")
      }
    } catch { setAddMemberError("Something went wrong") }
    finally { setAddMemberLoading(false) }
  }

  const totalUnread = rooms.reduce((s, r) => s + r.unreadCount, 0)

  // ─────────────────────────────────────────────────────────────
  return (
    <aside className={cn(
      "absolute left-0 top-0 bottom-0 z-20 w-[320px] flex flex-col overflow-hidden",
      "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
      "bg-white/72 backdrop-blur-md border-r border-slate-200/40 shadow-2xl shadow-black/[0.06]",
      effectiveOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-full pointer-events-none",
    )}>

      {/* RIFFLOW logo — fades out after first interaction */}
      <div className={cn(
        "flex flex-col items-center flex-shrink-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
        isInitial ? "pt-10 pb-4 opacity-100 max-h-[180px]" : "opacity-0 max-h-0 overflow-hidden pointer-events-none",
      )}>
        <div className="w-full max-w-[120px] h-[1.5px] bg-slate-900" />
        <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-none py-1"
          style={{ fontFamily: "'Times New Roman', Times, serif" }}>RIFFLOW</h1>
        <div className="w-full max-w-[120px] h-[1.5px] bg-slate-900 mb-3" />
        <div className="flex items-baseline gap-1">
          <span className="text-2xl text-blue-600 font-normal"
            style={{ fontFamily: "'Dancing Script','Brush Script MT',cursive", transform: "rotate(-2deg) translateX(2px)", display: "inline-block" }}>
            Workflow
          </span>
          <span className="text-[10px] font-bold tracking-tighter text-slate-500 italic">Studio</span>
        </div>
      </div>

      {/* Views */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* ══ LIST ══════════════════════════════════════════════ */}
        {view === "list" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100/80 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm text-slate-800">Messages</h2>
                {totalUnread > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none">{totalUnread}</span>
                )}
              </div>
              <button
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                onClick={() => { setIsInitial(false); setNewRoomName(""); setView("new") }}
                title="New conversation"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar" onClick={() => setIsInitial(false)}>
              {roomsLoading && (
                <div className="p-4 space-y-4">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="flex gap-3 items-center animate-pulse">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-slate-200 rounded w-28" />
                        <div className="h-2.5 bg-slate-100 rounded w-36" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!roomsLoading && rooms.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                    <Plus size={22} className="text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">No conversations yet</p>
                  <p className="text-xs text-slate-400 mt-1">Create one to get started</p>
                  <button
                    className="mt-4 px-3 py-1.5 rounded-xl bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-all"
                    onClick={() => { setIsInitial(false); setView("new") }}
                  >
                    New Conversation
                  </button>
                </div>
              )}

              {rooms.map(room => (
                <RoomItem key={room.id} room={room} active={activeRoom?.id === room.id} meId={meId} onClick={() => openRoom(room)} />
              ))}
            </div>
          </div>
        )}

        {/* ══ NEW ═══════════════════════════════════════════════ */}
        {view === "new" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100/80 flex-shrink-0">
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                onClick={() => setView("list")}>
                <ArrowLeft size={16} />
              </button>
              <span className="font-semibold text-sm text-slate-700">New Conversation</span>
            </div>

            <div className="flex-1 p-4 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">
                  Name <span className="font-normal normal-case text-slate-300">(optional)</span>
                </label>
                <input
                  autoFocus
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCreateRoom() }}
                  placeholder="e.g. Design Review, AI Assistant…"
                  className="w-full text-sm bg-slate-100 rounded-xl px-3 py-2.5 outline-none placeholder-slate-300 text-slate-700 border border-transparent focus:border-blue-300 transition-colors"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                You can add members after creating. Even solo, you can chat with AI.
              </p>
              <button
                disabled={creating}
                onClick={handleCreateRoom}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm shadow-blue-200"
              >
                {creating
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Plus size={15} />}
                Create Conversation
              </button>
            </div>
          </div>
        )}

        {/* ══ CHAT ══════════════════════════════════════════════ */}
        {view === "chat" && activeRoom && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100/80 flex-shrink-0 min-h-[50px]">
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                onClick={() => setView("list")}>
                <ArrowLeft size={16} />
              </button>
              <RoomAvatar room={activeRoom} meId={meId} className="w-8 h-8 text-xs flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 truncate leading-tight">
                  {getRoomDisplayName(activeRoom, meId)}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {activeRoom.members.length === 1 ? "Just you" : `${activeRoom.members.length} members`}
                  {agentMode && <span className="text-violet-400"> · AI on</span>}
                </p>
              </div>
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                onClick={() => setView("detail")}>
                <Info size={15} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2.5 custom-scrollbar">
              {messagesLoading && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-400 rounded-full animate-spin" />
                </div>
              )}

              {!messagesLoading && activeRoom.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full pb-8 text-center px-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                    <Users size={20} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{getRoomDisplayName(activeRoom, meId)}</p>
                  <p className="text-xs text-slate-400 mt-1">Say something to get started</p>
                </div>
              )}

              {activeRoom.messages.map((msg, i) => {
                const isGroup = activeRoom.members.length > 2
                return (
                  <div key={msg.id ?? i} className={cn("flex flex-col", msg.isMe ? "items-end" : "items-start")}>
                    {!msg.isMe && (
                      <div className="flex items-center gap-1.5 mb-1 ml-1">
                        {msg.isAI ? (
                          <>
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                              <Bot size={11} className="text-white" />
                            </div>
                            <span className="text-[10px] text-violet-400 font-medium">
                              {TEXT_MODELS.find(m => m.id === msg.aiModel)?.name ?? "AI"}
                            </span>
                          </>
                        ) : isGroup && msg.senderName ? (
                          <span className="text-[10px] text-slate-400 font-medium">{msg.senderName}</span>
                        ) : null}
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      msg.isMe ? "bg-blue-500 text-white rounded-br-sm"
                        : msg.isAI ? "bg-gradient-to-br from-violet-50 to-indigo-50 text-slate-800 border border-violet-100/80 rounded-bl-sm"
                        : "bg-slate-100/90 text-slate-800 rounded-bl-sm",
                    )}>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                      <p className={cn("text-[10px] mt-1", msg.isMe ? "text-blue-100" : "text-slate-400")}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                )
              })}

              {aiLoading && (
                <div className="flex items-start gap-1.5">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={11} className="text-white" />
                  </div>
                  <div className="bg-violet-50 border border-violet-100 rounded-2xl rounded-bl-sm px-3 py-2.5">
                    <div className="flex gap-1 items-center">
                      {[0, 150, 300].map(d => (
                        <div key={d} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 border-t border-slate-100/80">
              <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
                <button
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
                    agentMode ? "bg-violet-500 text-white shadow-sm shadow-violet-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                  )}
                  onClick={() => setAgentMode(v => !v)}
                  title="Toggle AI replies (visible to all)"
                >
                  <Bot size={12} />
                  <span>AI {agentMode ? "on" : "off"}</span>
                </button>

                {agentMode && (
                  <div className="relative">
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
                      onClick={() => setModelDropOpen(v => !v)}
                    >
                      <Cpu size={10} />
                      <span className="max-w-[90px] truncate">{displayModelName}</span>
                      <ChevronDown size={10} />
                    </button>
                    {modelDropOpen && (
                      <div className="absolute bottom-full left-0 mb-1.5 w-[200px] bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1.5">
                        {TEXT_MODELS.map(m => (
                          <button key={m.id}
                            className={cn("w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors flex items-center gap-2", selectedModel === m.id && "bg-violet-50 text-violet-700 font-semibold")}
                            onClick={() => { setSelectedModel(m.id); setModelDropOpen(false) }}
                          >
                            <span className="flex-1 truncate">{m.name}</span>
                            {selectedModel === m.id && <span className="text-violet-500">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {agentMode && <span className="text-[10px] text-violet-400 ml-auto">visible to all</span>}
              </div>

              <div className="flex items-end gap-2 px-3 pb-3 pt-1">
                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  onInput={e => {
                    const t = e.currentTarget; t.style.height = "auto"
                    t.style.height = Math.min(t.scrollHeight, 120) + "px"
                  }}
                  placeholder="Message…"
                  rows={1}
                  maxLength={2000}
                  className="flex-1 resize-none outline-none text-sm bg-slate-100 rounded-xl px-3 py-2 placeholder-slate-400 text-slate-800 min-h-[36px] max-h-[120px]"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || sending || aiLoading}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                    inputText.trim() && !sending && !aiLoading
                      ? "bg-blue-500 text-white shadow-md shadow-blue-200 hover:bg-blue-600 active:scale-95"
                      : "bg-slate-100 text-slate-300",
                  )}
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ DETAIL ════════════════════════════════════════════ */}
        {view === "detail" && activeRoom && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
              <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                onClick={() => setView("chat")}>
                <ArrowLeft size={16} />
              </button>
              <span className="font-semibold text-sm text-slate-700">Chat Info</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {/* Room header */}
              <div className="flex flex-col items-center pt-8 pb-6 px-4 border-b border-slate-100">
                <RoomAvatar room={activeRoom} meId={meId} className="w-16 h-16 text-xl" />
                <h3 className="mt-3 font-semibold text-base text-slate-800">{getRoomDisplayName(activeRoom, meId)}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeRoom.members.length === 1 ? "Solo" : `${activeRoom.members.length} members`}
                </p>
              </div>

              {/* Members */}
              <div className="px-4 py-4 border-b border-slate-100">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Members</h4>
                <div className="space-y-2.5">
                  {activeRoom.members.map(m => (
                    <div key={m.id} className="flex items-center gap-2.5">
                      <MemberAvatar member={m} className="w-8 h-8 text-xs flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 font-medium truncate">{m.id === meId ? "You" : (m.name ?? "Unknown")}</p>
                        {m.role === "admin" && <p className="text-[10px] text-slate-400">admin</p>}
                      </div>
                      {m.id === meId && agentMode && (
                        <span className="text-[10px] text-violet-500 bg-violet-50 px-1.5 py-0.5 rounded-full">AI on</span>
                      )}
                    </div>
                  ))}
                  {agentMode && (
                    <div className="flex items-center gap-2.5 pt-1 border-t border-slate-50">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                        <Bot size={14} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-violet-700 font-medium truncate">{displayModelName}</p>
                        <p className="text-[10px] text-violet-400">AI · replies to your messages</p>
                      </div>
                      <button className="p-1 text-slate-300 hover:text-red-400 transition-colors" onClick={() => setAgentMode(false)}>
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Your AI Agent */}
              <div className="px-4 py-4 border-b border-slate-100">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Your AI Agent</h4>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  When on, your messages trigger an AI reply — saved to this chat, visible to everyone.
                  Each person controls their own AI independently.
                </p>
                {agentMode ? (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-violet-50 border border-violet-100">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-violet-500" />
                      <div>
                        <p className="text-xs font-semibold text-violet-800">{displayModelName}</p>
                        <p className="text-[10px] text-violet-500">Active</p>
                      </div>
                    </div>
                    <button className="text-xs text-violet-400 hover:text-red-500 font-medium transition-colors"
                      onClick={() => setAgentMode(false)}>Turn off</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="space-y-1 max-h-[160px] overflow-y-auto custom-scrollbar">
                      {TEXT_MODELS.map(m => (
                        <button key={m.id}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 border",
                            selectedModel === m.id ? "bg-violet-50 text-violet-700 border-violet-200 font-semibold" : "hover:bg-slate-50 text-slate-600 border-transparent",
                          )}
                          onClick={() => setSelectedModel(m.id)}
                        >
                          <Cpu size={11} className={selectedModel === m.id ? "text-violet-500" : "text-slate-400"} />
                          <span className="flex-1">{m.name}</span>
                          {selectedModel === m.id && <span className="text-violet-500">✓</span>}
                        </button>
                      ))}
                    </div>
                    <button
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 active:scale-[0.98] transition-all"
                      onClick={() => { setAgentMode(true); setView("chat") }}
                    >
                      <Bot size={14} /> Enable {displayModelName}
                    </button>
                  </div>
                )}
              </div>

              {/* Add member */}
              <div className="px-4 py-4 border-b border-slate-100">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <UserPlus size={11} /> Add Member
                </h4>
                <div className="flex gap-2">
                  <input
                    value={addMemberId}
                    onChange={e => { setAddMemberId(e.target.value); setAddMemberError("") }}
                    onKeyDown={e => { if (e.key === "Enter") handleAddMember() }}
                    placeholder="User ID…"
                    className="flex-1 text-xs bg-slate-100 rounded-lg px-3 py-2 outline-none placeholder-slate-400 text-slate-700 border border-transparent focus:border-blue-300 transition-colors"
                  />
                  <button
                    disabled={!addMemberId.trim() || addMemberLoading}
                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-all active:scale-95"
                    onClick={handleAddMember}
                  >
                    {addMemberLoading
                      ? <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <UserPlus size={13} />}
                  </button>
                </div>
                {addMemberError && <p className="text-xs text-red-500 mt-1.5">{addMemberError}</p>}
              </div>

              {/* Leave */}
              <div className="px-4 py-4">
                <button
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-all"
                  onClick={async () => {
                    await fetch(`/api/rooms/${activeRoom.id}/members`, { method: "DELETE" })
                    setActiveRoom(null)
                    setView("list")
                    fetchRooms()
                  }}
                >
                  <Trash2 size={14} /> Leave Conversation
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </aside>
  )
}
