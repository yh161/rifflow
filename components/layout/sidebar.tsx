"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { cn } from "@/lib/utils"
import {
  ArrowLeft, Send, Bot, Info, Plus, ChevronDown,
  Users, X, Trash2, UserPlus, Crown, Shield, AlertTriangle,
  Check, Loader2, Globe, Lock, MoreVertical, LogOut, Settings, ImagePlus,
} from "lucide-react"
import { TEXT_MODELS } from "@/lib/models"
import { calculateCreditCost } from "@/lib/credits"

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
  ownerId: string | null
  joinPermission: string
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
  myRole: string
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
  width: number
  onWidthChange: (width: number) => void
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
  const others = room.members.filter((m) => m.id !== meId)
  if (others.length === 0) return "My Space"
  if (others.length === 1) return others[0].name ?? "Unknown"
  return others.map((m) => m.name?.split(" ")[0] ?? "?").join(", ")
}

/** Detect @Rify mention */
function detectRifyMention(text: string): boolean {
  return /(^|\s)@Rify(?=\s|$)/i.test(text)
}

function parseMessageContent(content: string): { text: string; imageUrls: string[] } {
  const imageUrls: string[] = []
  const text = content
    .replace(/\[\[image:(.+?)\]\]/g, (_m, p1: string) => {
      imageUrls.push(String(p1).trim())
      return ""
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return { text, imageUrls }
}

function messagePreview(content: string): string {
  const { text, imageUrls } = parseMessageContent(content)
  if (text) return text
  if (imageUrls.length > 0) return "[Image]"
  return ""
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "" }
const ROLE_ICON: Record<string, React.ReactNode> = {
  owner: <Crown size={11} className="text-amber-500" />,
  admin: <Shield size={11} className="text-blue-500" />,
}

// ─────────────────────────────────────────────
// Avatar components
// ─────────────────────────────────────────────

function MemberAvatar({
  member,
  className,
}: {
  member: { name?: string | null; image?: string | null }
  className?: string
}) {
  if (member.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.image} alt="" className={cn("rounded-full object-cover", className)} />
  }
  return (
    <div className={cn("rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white font-semibold select-none", className)}>
      {(member.name ?? "?")[0].toUpperCase()}
    </div>
  )
}

/** Mini avatar for group grid — fills container */
function MiniAvatar({ member }: { member: { name?: string | null; image?: string | null } }) {
  if (member.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.image} alt="" className="w-full h-full object-cover" />
  }
  return (
    <div className="w-full h-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-[9px] font-bold select-none">
      {(member.name ?? "?")[0].toUpperCase()}
    </div>
  )
}

/** Group avatar grid — 2-person: side-by-side; 3: tri; 4+: 2×2 */
function GroupAvatarGrid({ others, size = 40 }: { others: RoomMember[]; size?: number }) {
  const tiles = others.slice(0, 4)
  const half = Math.floor((size - 2) / 2)

  if (tiles.length === 0) return null
  if (tiles.length === 1) {
    return (
      <div style={{ width: size, height: size }} className="rounded-full overflow-hidden flex-shrink-0">
        <MemberAvatar member={tiles[0]} className="w-full h-full" />
      </div>
    )
  }

  return (
    <div
      className="rounded-full overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, position: "relative" }}
    >
      {tiles.length === 2 && (
        <div className="absolute inset-0 flex gap-px">
          <div style={{ width: half, height: size }}><MiniAvatar member={tiles[0]} /></div>
          <div style={{ width: size - half - 1, height: size }}><MiniAvatar member={tiles[1]} /></div>
        </div>
      )}
      {tiles.length === 3 && (
        <div className="absolute inset-0">
          <div className="flex gap-px" style={{ height: half }}>
            <div style={{ width: half }}><MiniAvatar member={tiles[0]} /></div>
            <div style={{ width: size - half - 1 }}><MiniAvatar member={tiles[1]} /></div>
          </div>
          <div style={{ height: 1 }} />
          <div className="flex justify-center" style={{ height: size - half - 1 }}>
            <div style={{ width: half }}><MiniAvatar member={tiles[2]} /></div>
          </div>
        </div>
      )}
      {tiles.length >= 4 && (
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px">
          {tiles.map((t, i) => <div key={i}><MiniAvatar member={t} /></div>)}
        </div>
      )}
    </div>
  )
}

function RoomAvatar({
  room,
  meId,
  size = 40,
  className,
}: {
  room: RoomSummary
  meId: string
  size?: number
  className?: string
}) {
  const others = room.members.filter((m) => m.id !== meId)

  if (others.length === 0) {
    return (
      <div
        className={cn("rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center text-white flex-shrink-0", className)}
        style={{ width: size, height: size }}
      >
        <Bot size={Math.round(size * 0.45)} />
      </div>
    )
  }

  // 1-to-1: use other person's avatar directly
  if (others.length === 1) {
    return (
      <div className={cn("rounded-full overflow-hidden flex-shrink-0", className)} style={{ width: size, height: size }}>
        <MemberAvatar member={others[0]} className="w-full h-full" />
      </div>
    )
  }

  // Group: multi-avatar grid
  return (
    <div className={cn("flex-shrink-0", className)}>
      <GroupAvatarGrid others={others} size={size} />
    </div>
  )
}

// ─────────────────────────────────────────────
// RoomItem
// ─────────────────────────────────────────────

function RoomItem({
  room,
  active,
  meId,
  onClick,
}: {
  room: RoomSummary
  active: boolean
  meId: string
  onClick: () => void
}) {
  const displayName = getRoomDisplayName(room, meId)
  const last = room.lastMessage
  const isGroup = room.members.length > 2

  return (
    <button
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/80 transition-colors text-left",
        active && "bg-blue-50/70"
      )}
      onClick={onClick}
    >
      <div className="relative flex-shrink-0">
        <RoomAvatar room={room} meId={meId} size={40} />
        {room.unreadCount > 0 && (
          <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border-2 border-white" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm truncate", room.unreadCount > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-700")}>
            {displayName}
          </span>
          {last && (
            <span className="text-[10px] text-slate-400 flex-shrink-0 ml-1.5">
              {formatTime(last.createdAt)}
            </span>
          )}
        </div>
        <p className={cn("text-xs truncate mt-0.5", room.unreadCount > 0 ? "text-slate-600" : "text-slate-400")}>
          {last ? (
            last.isAI ? (
              <><span className="text-violet-400">Rify: </span>{messagePreview(last.content)}</>
            ) : last.isMe ? (
              <><span className="text-slate-400">You: </span>{messagePreview(last.content)}</>
            ) : isGroup && last.senderName ? (
              <><span className="text-slate-500">{last.senderName.split(" ")[0]}: </span>{messagePreview(last.content)}</>
            ) : (
              messagePreview(last.content)
            )
          ) : (
            <span className="italic">No messages yet</span>
          )}
        </p>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────
// Main Sidebar
// ─────────────────────────────────────────────

export default function Sidebar({ isOpen, onClose: _onClose, width, onWidthChange, isRunning = false }: SidebarProps) {
  const { data: session } = useSession()
  const meId = session?.user?.id ?? ""
  const SIDEBAR_MIN_WIDTH = 260
  const SIDEBAR_MAX_WIDTH = 560

  const [isInitial, setIsInitial] = useState(true)
  const [view, setView] = useState<"list" | "new" | "chat" | "detail">("list")

  // Room list
  const [rooms, setRooms] = useState<RoomSummary[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)

  // Active room
  const [activeRoom, setActiveRoom] = useState<RoomDetail | null>(null)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  // Chat input
  const [inputText, setInputText] = useState("")
  const [attachedImages, setAttachedImages] = useState<Array<{ file: File; preview: string }>>([])
  const [sending, setSending] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)

  // Model params per room per model — { roomId: { modelId: { paramKey: value } } }
  const [roomModelParams, setRoomModelParams] = useState<Record<string, Record<string, Record<string, string>>>>({})
  // Which model is shown in the detail settings panel
  const [detailModel, setDetailModel] = useState(TEXT_MODELS[0].id)

  // New room form
  const [newRoomName, setNewRoomName] = useState("")
  const [creating, setCreating] = useState(false)

  // Detail — edit room name
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [nameLoading, setNameLoading] = useState(false)

  // Detail — add member
  const [addMemberId, setAddMemberId] = useState("")
  const [addMemberLoading, setAddMemberLoading] = useState(false)
  const [addMemberError, setAddMemberError] = useState("")

  // Detail — member action menu
  const [memberMenuId, setMemberMenuId] = useState<string | null>(null)

  // Detail — dissolve confirmation
  const [confirmDissolve, setConfirmDissolve] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesTopRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const prevScrollHeightRef = useRef(0)
  const msgContainerRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const resizeStartXRef = useRef(0)
  const resizeStartWidthRef = useRef(width)

  const effectiveOpen = isOpen && !isRunning

  const stopResize = useCallback(() => {
    if (!isResizingRef.current) return
    isResizingRef.current = false
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
    window.removeEventListener("pointermove", handleResizeMove)
    window.removeEventListener("pointerup", stopResize)
    window.removeEventListener("pointercancel", stopResize)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleResizeMove = useCallback((e: PointerEvent) => {
    if (!isResizingRef.current) return
    const delta = e.clientX - resizeStartXRef.current
    const next = resizeStartWidthRef.current + delta
    onWidthChange(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, next)))
  }, [onWidthChange])

  const handleResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!effectiveOpen || isRunning) return
    e.preventDefault()
    isResizingRef.current = true
    resizeStartXRef.current = e.clientX
    resizeStartWidthRef.current = width
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    window.addEventListener("pointermove", handleResizeMove)
    window.addEventListener("pointerup", stopResize)
    window.addEventListener("pointercancel", stopResize)
  }, [effectiveOpen, handleResizeMove, isRunning, stopResize, width])

  useEffect(() => stopResize, [stopResize])

  // Current room's model params
  const currentRoomId = activeRoom?.id ?? ""
  const getModelParams = useCallback(
    (roomId: string, modelId: string) =>
      roomModelParams[roomId]?.[modelId] ?? {},
    [roomModelParams]
  )
  const setModelParam = useCallback(
    (roomId: string, modelId: string, key: string, val: string) => {
      setRoomModelParams((prev) => ({
        ...prev,
        [roomId]: {
          ...prev[roomId],
          [modelId]: { ...(prev[roomId]?.[modelId] ?? {}), [key]: val },
        },
      }))
    },
    []
  )

  useEffect(() => {
    return () => {
      attachedImages.forEach((img) => URL.revokeObjectURL(img.preview))
    }
  }, [attachedImages])

  // ── Fetch room list ───────────────────────────────────────────────────────
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

  // ── Poll active room messages ─────────────────────────────────────────────
  const fetchRoomMessages = useCallback(async (roomId: string) => {
    try {
      const r = await fetch(`/api/rooms/${roomId}`)
      if (!r.ok) return
      const data = await r.json()
      if (!data?.room) return
      setActiveRoom((prev) => {
        if (!prev || prev.id !== roomId) return prev
        const prevLastId = prev.messages.at(-1)?.id
        const nextLastId = data.room.messages.at(-1)?.id
        if (prev.messages.length === data.room.messages.length && prevLastId === nextLastId) return prev
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
        return { ...data.room, myRole: data.room.myRole ?? prev.myRole }
      })
      if (data.hasMore !== undefined) setHasMoreMessages(data.hasMore)
    } catch {}
  }, [])

  useEffect(() => {
    if (!activeRoom) return
    const roomId = activeRoom.id
    const id = setInterval(() => fetchRoomMessages(roomId), 3000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.id, fetchRoomMessages])

  // ── Sidebar event bus ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ contactId: string }>).detail
      if (detail?.contactId === "__inbox__") {
        setIsInitial(false)
        setView("list")
      }
    }
    window.addEventListener("sidebar:openChat", handler)
    return () => window.removeEventListener("sidebar:openChat", handler)
  }, [])

  // ── Open a room ───────────────────────────────────────────────────────────
  const openRoom = async (room: RoomSummary) => {
    setIsInitial(false)
    setActiveRoom({ ...room, messages: [] })
    setInputText("")
    setAttachedImages([])
    setCreditError(null)
    setView("chat")
    setMessagesLoading(true)
    setHasMoreMessages(false)
    try {
      const r = await fetch(`/api/rooms/${room.id}`)
      const data = await r.json()
      if (data?.room) {
        setActiveRoom({ ...data.room, myRole: data.room.myRole ?? room.myRole })
        setHasMoreMessages(data.hasMore ?? false)
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "instant" }), 100)
      }
    } catch {}
    finally { setMessagesLoading(false) }
  }

  // ── Load earlier messages ─────────────────────────────────────────────────
  const loadMoreMessages = async () => {
    if (!activeRoom || loadingMore || !hasMoreMessages) return
    const oldestId = activeRoom.messages[0]?.id
    if (!oldestId) return
    setLoadingMore(true)
    const container = msgContainerRef.current
    if (container) prevScrollHeightRef.current = container.scrollHeight
    try {
      const r = await fetch(`/api/rooms/${activeRoom.id}?before=${oldestId}&limit=50`)
      const data = await r.json()
      if (data?.room?.messages) {
        setActiveRoom((prev) => prev ? { ...prev, messages: [...data.room.messages, ...prev.messages] } : prev)
        setHasMoreMessages(data.hasMore ?? false)
        // Preserve scroll position after prepending
        setTimeout(() => {
          if (container) {
            container.scrollTop = container.scrollHeight - prevScrollHeightRef.current
          }
        }, 10)
      }
    } catch {}
    finally { setLoadingMore(false) }
  }

  // ── Create new room ───────────────────────────────────────────────────────
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

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!activeRoom || sending || aiLoading) return
    const rawText = inputText.trim()
    if (!rawText && attachedImages.length === 0) return

    let imageMarkers = ""
    if (attachedImages.length > 0) {
      const urls: string[] = []
      for (const img of attachedImages) {
        try {
          const form = new FormData()
          form.append("file", img.file)
          const up = await fetch("/api/upload", { method: "POST", body: form })
          const json = await up.json() as { url?: string }
          if (up.ok && json.url) urls.push(json.url)
        } catch {}
      }
      imageMarkers = urls.map((u) => `[[image:${u}]]`).join("\n")
    }

    const content = [rawText, imageMarkers].filter(Boolean).join(rawText && imageMarkers ? "\n" : "")
    if (!content.trim()) return

    setInputText("")
    attachedImages.forEach((img) => URL.revokeObjectURL(img.preview))
    setAttachedImages([])
    setCreditError(null)
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

      setActiveRoom((prev) => prev ? { ...prev, messages: [...prev.messages, message] } : prev)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
      setRooms((prev) =>
        prev
          .map((rm) =>
            rm.id === activeRoom.id
              ? {
                  ...rm,
                  lastMessage: { content, createdAt: message.createdAt, isMe: true, isAI: false, senderName: null },
                  updatedAt: message.createdAt,
                }
              : rm
          )
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      )

      // Detect @Rify mention → trigger AI with selected detail model
      if (detectRifyMention(content)) {
        const selectedModel = detailModel
        setAiLoading(true)
        try {
          const isGroup = activeRoom.members.length > 2
          const history = [...activeRoom.messages, message].slice(-20).map((m) => {
            if (m.isAI) return { role: "assistant" as const, content: m.content }
            const prefix = isGroup ? `[${m.isMe ? "Me" : (m.senderName ?? "User")}]: ` : ""
            return { role: "user" as const, content: prefix + m.content }
          })

          const params = getModelParams(activeRoom.id, selectedModel)
          const aiR = await fetch(`/api/rooms/${activeRoom.id}/ai`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: selectedModel, messages: history, modelParams: params }),
          })

          if (aiR.status === 402) {
            const errData = await aiR.json()
            setCreditError(`Not enough credits. Need ${errData.required}, have ${errData.available}.`)
          } else if (aiR.ok) {
            const { message: aiMsg } = await aiR.json()
            setActiveRoom((prev) => prev ? { ...prev, messages: [...prev.messages, aiMsg] } : prev)
            setRooms((prev) =>
              prev.map((rm) =>
                rm.id === activeRoom.id
                  ? { ...rm, lastMessage: { content: aiMsg.content, createdAt: aiMsg.createdAt, isMe: false, isAI: true, senderName: null }, updatedAt: aiMsg.createdAt }
                  : rm
              )
            )
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80)
          }
        } catch {}
        finally { setAiLoading(false) }
      }
    } finally { setSending(false) }
  }

  const insertRifyMention = () => {
    const ta = textareaRef.current
    if (!ta) { setInputText((v) => `@Rify ${v}`.trim()); return }
    const pos = ta.selectionStart ?? inputText.length
    const before = inputText.slice(0, pos)
    const after = inputText.slice(pos)
    const insert = "@Rify "
    const newVal = before + insert + after
    setInputText(newVal)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(pos + insert.length, pos + insert.length)
    }, 10)
  }

  const handleAttachImages = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const next: Array<{ file: File; preview: string }> = []
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return
      next.push({ file, preview: URL.createObjectURL(file) })
    })
    if (next.length > 0) setAttachedImages((prev) => [...prev, ...next])
  }

  const removeAttachedImage = (index: number) => {
    setAttachedImages((prev) => {
      const item = prev[index]
      if (item) URL.revokeObjectURL(item.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  // ── Add member ────────────────────────────────────────────────────────────
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
        setActiveRoom((prev) => prev ? { ...prev, members: [...prev.members, data.member] } : prev)
        setAddMemberId("")
      } else {
        setAddMemberError(data.error ?? "Failed")
      }
    } catch { setAddMemberError("Something went wrong") }
    finally { setAddMemberLoading(false) }
  }

  // ── Member action ─────────────────────────────────────────────────────────
  const handleMemberAction = async (targetId: string, action: string) => {
    if (!activeRoom) return
    setMemberMenuId(null)
    try {
      const r = await fetch(`/api/rooms/${activeRoom.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId, action }),
      })
      const data = await r.json()
      if (r.ok) {
        if (action === "kick") {
          setActiveRoom((prev) => prev ? { ...prev, members: prev.members.filter((m) => m.id !== targetId) } : prev)
        } else if (action === "setAdmin" || action === "removeAdmin") {
          setActiveRoom((prev) =>
            prev ? { ...prev, members: prev.members.map((m) => m.id === targetId ? { ...m, role: data.newRole } : m) } : prev
          )
        } else if (action === "transferOwnership") {
          setActiveRoom((prev) =>
            prev
              ? {
                  ...prev,
                  ownerId: targetId,
                  myRole: "admin",
                  members: prev.members.map((m) => {
                    if (m.id === targetId) return { ...m, role: "owner" }
                    if (m.id === meId) return { ...m, role: "admin" }
                    return m
                  }),
                }
              : prev
          )
        }
      }
    } catch {}
  }

  // ── Rename room ───────────────────────────────────────────────────────────
  const handleRename = async () => {
    if (!activeRoom || nameLoading) return
    setNameLoading(true)
    try {
      const r = await fetch(`/api/rooms/${activeRoom.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput }),
      })
      if (r.ok) {
        const data = await r.json()
        setActiveRoom((prev) => prev ? { ...prev, name: data.name } : prev)
        setRooms((prev) => prev.map((rm) => rm.id === activeRoom.id ? { ...rm, name: data.name } : rm))
        setEditingName(false)
      }
    } catch {}
    finally { setNameLoading(false) }
  }

  // ── Update join permission ────────────────────────────────────────────────
  const handleJoinPermission = async (perm: string) => {
    if (!activeRoom) return
    try {
      const r = await fetch(`/api/rooms/${activeRoom.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinPermission: perm }),
      })
      if (r.ok) {
        const data = await r.json()
        setActiveRoom((prev) => prev ? { ...prev, joinPermission: data.joinPermission } : prev)
        setRooms((prev) => prev.map((rm) => rm.id === activeRoom.id ? { ...rm, joinPermission: data.joinPermission } : rm))
      }
    } catch {}
  }

  // ── Dissolve room ─────────────────────────────────────────────────────────
  const handleDissolve = async () => {
    if (!activeRoom) return
    try {
      const r = await fetch(`/api/rooms/${activeRoom.id}`, { method: "DELETE" })
      if (r.ok) {
        setActiveRoom(null)
        setView("list")
        setConfirmDissolve(false)
        await fetchRooms()
      }
    } catch {}
  }

  // ── Leave room ────────────────────────────────────────────────────────────
  const handleLeave = async () => {
    if (!activeRoom) return
    const r = await fetch(`/api/rooms/${activeRoom.id}/members`, { method: "DELETE" })
    if (r.ok) {
      setActiveRoom(null)
      setView("list")
      await fetchRooms()
    }
  }

  const totalUnread = rooms.reduce((s, r) => s + r.unreadCount, 0)
  const myRoleInRoom = activeRoom?.myRole ?? activeRoom?.members.find((m) => m.id === meId)?.role ?? "member"
  const isAdminOrOwner = ["owner", "admin"].includes(myRoleInRoom)
  const isOwner = myRoleInRoom === "owner"

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <aside
      className={cn(
        "absolute left-0 top-0 bottom-0 z-20 flex flex-col overflow-hidden",
        "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "bg-white/72 backdrop-blur-md border-r border-slate-200/40 shadow-2xl shadow-black/[0.06]",
        effectiveOpen ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-full pointer-events-none"
      )}
      style={{ width }}
    >
      {/* RIFFLOW intro — fades after first interaction */}
      <div
        className={cn(
          "flex flex-col items-center flex-shrink-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isInitial ? "pt-10 pb-4 opacity-100 max-h-[180px]" : "opacity-0 max-h-0 overflow-hidden pointer-events-none"
        )}
      >
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
            style={{ fontFamily: "'Dancing Script','Brush Script MT',cursive", transform: "rotate(-2deg) translateX(2px)", display: "inline-block" }}
          >
            Workflow
          </span>
          <span className="text-[10px] font-bold tracking-tighter text-slate-500 italic">Studio</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

        {/* ══ LIST ════════════════════════════════════════════════════════════ */}
        {view === "list" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100/80 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-sm text-slate-800">Messages</h2>
                {totalUnread > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none">
                    {totalUnread}
                  </span>
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
                  {[0, 1, 2].map((i) => (
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
              {rooms.map((room) => (
                <RoomItem key={room.id} room={room} active={activeRoom?.id === room.id} meId={meId} onClick={() => openRoom(room)} />
              ))}
            </div>
          </div>
        )}

        {/* ══ NEW ═══════════════════════════════════════════════════════════ */}
        {view === "new" && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100/80 flex-shrink-0">
              <button
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                onClick={() => setView("list")}
              >
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
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateRoom() }}
                  placeholder="e.g. Design Review, AI Assistant…"
                  className="w-full text-sm bg-slate-100 rounded-xl px-3 py-2.5 outline-none placeholder-slate-300 text-slate-700 border border-transparent focus:border-blue-300 transition-colors"
                />
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Add members after creating. Use <span className="font-mono text-violet-500 bg-violet-50 px-1 rounded">@Rify</span> to invoke AI.
              </p>
              <button
                disabled={creating}
                onClick={handleCreateRoom}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm shadow-blue-200"
              >
                {creating ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Plus size={15} />}
                Create Conversation
              </button>
            </div>
          </div>
        )}

        {/* ══ CHAT ══════════════════════════════════════════════════════════ */}
        {view === "chat" && activeRoom && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100/80 flex-shrink-0 min-h-[50px]">
              <button
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                onClick={() => setView("list")}
              >
                <ArrowLeft size={16} />
              </button>
              <RoomAvatar room={activeRoom} meId={meId} size={32} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-slate-800 truncate leading-tight">
                  {getRoomDisplayName(activeRoom, meId)}
                </p>
                <p className="text-[10px] text-slate-400 leading-tight">
                  {activeRoom.members.length === 1 ? "Just you" : `${activeRoom.members.length} members`}
                </p>
              </div>
              <button
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                onClick={() => {
                  setEditingName(false)
                  setNameInput(activeRoom.name ?? "")
                  setConfirmDissolve(false)
                  setMemberMenuId(null)
                  setView("detail")
                }}
              >
                <Info size={15} />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={msgContainerRef}
              className="flex-1 overflow-y-auto px-3 py-2 space-y-2.5 custom-scrollbar"
            >
              {/* Load more */}
              {hasMoreMessages && (
                <div className="flex justify-center pt-1 pb-2">
                  <button
                    onClick={loadMoreMessages}
                    disabled={loadingMore}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? <Loader2 size={12} className="animate-spin" /> : <ChevronDown size={12} className="rotate-180" />}
                    Load earlier messages
                  </button>
                </div>
              )}
              <div ref={messagesTopRef} />

              {messagesLoading && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-blue-400 rounded-full animate-spin" />
                </div>
              )}

              {!messagesLoading && activeRoom.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full pb-8 text-center px-4 pt-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                    <Users size={20} className="text-slate-400" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">{getRoomDisplayName(activeRoom, meId)}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Say something, or use <span className="font-mono text-violet-500">@Rify</span> to invoke AI
                  </p>
                </div>
              )}

              {activeRoom.messages.map((msg, i) => {
                const isGroup = activeRoom.members.length > 2
                const showSender = !msg.isMe && (isGroup || msg.isAI)
                return (
                  <div key={msg.id ?? i} className={cn("flex flex-col", msg.isMe ? "items-end" : "items-start")}>
                    {showSender && (
                      <div className="flex items-center gap-1.5 mb-1 ml-1">
                        {msg.isAI ? (
                          <>
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                              <Bot size={9} className="text-white" />
                            </div>
                            <span className="text-[10px] text-violet-400 font-medium">
                              Rify
                            </span>
                          </>
                        ) : msg.senderImage ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={msg.senderImage} alt="" className="w-4 h-4 rounded-full object-cover" />
                            <span className="text-[10px] text-slate-400 font-medium">{msg.senderName}</span>
                          </>
                        ) : msg.senderName ? (
                          <span className="text-[10px] text-slate-400 font-medium">{msg.senderName}</span>
                        ) : null}
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                        msg.isMe
                          ? "bg-blue-500 text-white rounded-br-sm"
                          : msg.isAI
                          ? "bg-gradient-to-br from-violet-50 to-indigo-50 text-slate-800 border border-violet-100/80 rounded-bl-sm"
                          : "bg-slate-100/90 text-slate-800 rounded-bl-sm"
                      )}
                    >
                      {(() => {
                        const parsed = parseMessageContent(msg.content)
                        return (
                          <>
                            {parsed.text && (
                              <p className="whitespace-pre-wrap break-words leading-relaxed">{parsed.text}</p>
                            )}
                            {parsed.imageUrls.length > 0 && (
                              <div className={cn("grid gap-1.5 mt-1.5", parsed.imageUrls.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                                {parsed.imageUrls.map((url, idx) => (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={`${url}-${idx}`} src={url} alt="attachment" className="rounded-lg w-full max-h-44 object-cover border border-black/5" />
                                ))}
                              </div>
                            )}
                          </>
                        )
                      })()}
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
                      {[0, 150, 300].map((d) => (
                        <div key={d} className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Credit error banner */}
            {creditError && (
              <div className="mx-3 mb-1 px-3 py-2 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-2">
                <p className="text-xs text-red-600 leading-relaxed">{creditError}</p>
                <button onClick={() => setCreditError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="flex-shrink-0 border-t border-slate-100/80">
              <div className="px-3 pt-1.5 pb-1 flex items-center gap-1.5">
                <button
                  onClick={insertRifyMention}
                  className="h-6 px-2 rounded-md text-[11px] font-medium bg-violet-50 text-violet-600 hover:bg-violet-100 transition-colors inline-flex items-center gap-1"
                  title="Mention Rify"
                >
                  @Rify
                </button>
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="h-6 px-2 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors inline-flex items-center gap-1"
                  title="Attach image"
                >
                  <ImagePlus size={11} />
                  Image
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleAttachImages(e.target.files)
                    e.currentTarget.value = ""
                  }}
                />
              </div>

              {attachedImages.length > 0 && (
                <div className="px-3 pb-1.5 flex gap-2 overflow-x-auto custom-scrollbar">
                  {attachedImages.map((img, i) => (
                    <div key={`${img.file.name}-${i}`} className="relative w-14 h-14 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt={img.file.name} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeAttachedImage(i)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/55 text-white flex items-center justify-center"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2 px-3 pb-3 pt-1 relative">

                <textarea
                  ref={textareaRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
                  }}
                  onInput={(e) => {
                    const t = e.currentTarget
                    t.style.height = "auto"
                    t.style.height = Math.min(t.scrollHeight, 120) + "px"
                  }}
                  placeholder="Message…"
                  rows={1}
                  maxLength={2000}
                  className="flex-1 resize-none outline-none text-sm bg-slate-100 rounded-xl px-3 py-2 placeholder-slate-400 text-slate-800 min-h-[36px] max-h-[120px]"
                />
                <button
                  onClick={handleSend}
                  disabled={(!inputText.trim() && attachedImages.length === 0) || sending || aiLoading}
                  className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all self-end",
                    (inputText.trim() || attachedImages.length > 0) && !sending && !aiLoading
                      ? "bg-blue-500 text-white shadow-md shadow-blue-200 hover:bg-blue-600 active:scale-95"
                      : "bg-slate-100 text-slate-300"
                  )}
                >
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ DETAIL ════════════════════════════════════════════════════════ */}
        {view === "detail" && activeRoom && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 flex-shrink-0">
              <button
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                onClick={() => setView("chat")}
              >
                <ArrowLeft size={16} />
              </button>
              <span className="font-semibold text-sm text-slate-700">Chat Info</span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">

              {/* Avatar + Name */}
              <div className="flex flex-col items-center pt-6 pb-5 px-4 border-b border-slate-100">
                <RoomAvatar room={activeRoom} meId={meId} size={64} />
                {editingName ? (
                  <div className="flex items-center gap-2 mt-3 w-full max-w-[200px]">
                    <input
                      autoFocus
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditingName(false) }}
                      className="flex-1 text-sm text-center bg-slate-100 rounded-lg px-2 py-1 outline-none border border-blue-300"
                      placeholder="Room name…"
                    />
                    <button
                      onClick={handleRename}
                      disabled={nameLoading}
                      className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-50"
                    >
                      {nameLoading ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-3">
                    <h3 className="font-semibold text-base text-slate-800">{getRoomDisplayName(activeRoom, meId)}</h3>
                    {isAdminOrOwner && (
                      <button
                        onClick={() => { setNameInput(activeRoom.name ?? ""); setEditingName(true) }}
                        className="p-1 text-slate-300 hover:text-slate-500 transition-colors"
                        title="Edit room name"
                      >
                        <Settings size={13} />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {activeRoom.members.length === 1 ? "Solo" : `${activeRoom.members.length} members`}
                  {" · "}
                  <span className={cn("capitalize", myRoleInRoom === "owner" ? "text-amber-500" : myRoleInRoom === "admin" ? "text-blue-500" : "text-slate-400")}>
                    {myRoleInRoom}
                  </span>
                </p>
              </div>

              {/* Join permission */}
              {isAdminOrOwner && (
                <div className="px-4 py-3 border-b border-slate-100">
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Join Permission</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleJoinPermission("open")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                        activeRoom.joinPermission === "open"
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      <Globe size={11} /> Open
                    </button>
                    <button
                      onClick={() => handleJoinPermission("invite_only")}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
                        activeRoom.joinPermission === "invite_only"
                          ? "bg-blue-500 text-white border-blue-500"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      <Lock size={11} /> Invite Only
                    </button>
                  </div>
                </div>
              )}

              {/* Members list */}
              <div className="px-4 py-4 border-b border-slate-100">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Members</h4>
                <div className="space-y-2">
                  {activeRoom.members.map((m) => {
                    const isMe = m.id === meId
                    const canManage = isAdminOrOwner && !isMe
                    return (
                      <div key={m.id} className="flex items-center gap-2.5">
                        <MemberAvatar member={m} className="w-8 h-8 text-xs flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-sm text-slate-700 font-medium truncate">
                              {isMe ? "You" : (m.name ?? "Unknown")}
                            </p>
                            {ROLE_ICON[m.role] && <span className="flex-shrink-0">{ROLE_ICON[m.role]}</span>}
                          </div>
                          {ROLE_LABEL[m.role] && (
                            <p className="text-[10px] text-slate-400">{ROLE_LABEL[m.role]}</p>
                          )}
                        </div>
                        {canManage && (
                          <div className="relative flex-shrink-0">
                            <button
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                              onClick={() => setMemberMenuId(memberMenuId === m.id ? null : m.id)}
                            >
                              <MoreVertical size={13} />
                            </button>
                            {memberMenuId === m.id && (
                              <div className="absolute right-0 top-full mt-1 w-[160px] bg-white rounded-xl border border-slate-200 shadow-xl z-50 py-1">
                                {/* kick */}
                                <button
                                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
                                  onClick={() => handleMemberAction(m.id, "kick")}
                                >
                                  <Trash2 size={11} /> Remove from room
                                </button>
                                {/* set/remove admin (owner only) */}
                                {isOwner && m.role === "member" && (
                                  <button
                                    className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                                    onClick={() => handleMemberAction(m.id, "setAdmin")}
                                  >
                                    <Shield size={11} className="text-blue-500" /> Make admin
                                  </button>
                                )}
                                {isOwner && m.role === "admin" && (
                                  <button
                                    className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                                    onClick={() => handleMemberAction(m.id, "removeAdmin")}
                                  >
                                    <Shield size={11} /> Remove admin
                                  </button>
                                )}
                                {/* transfer ownership */}
                                {isOwner && m.role !== "owner" && (
                                  <button
                                    className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                                    onClick={() => handleMemberAction(m.id, "transferOwnership")}
                                  >
                                    <Crown size={11} className="text-amber-500" /> Transfer ownership
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Add member — admin/owner only */}
                {isAdminOrOwner && (
                  <div className="mt-3 pt-3 border-t border-slate-50">
                    <div className="flex gap-2">
                      <input
                        value={addMemberId}
                        onChange={(e) => { setAddMemberId(e.target.value); setAddMemberError("") }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddMember() }}
                        placeholder="Add by User ID…"
                        className="flex-1 text-xs bg-slate-100 rounded-lg px-3 py-2 outline-none placeholder-slate-400 text-slate-700 border border-transparent focus:border-blue-300 transition-colors"
                      />
                      <button
                        disabled={!addMemberId.trim() || addMemberLoading}
                        className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition-all active:scale-95"
                        onClick={handleAddMember}
                      >
                        {addMemberLoading ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                      </button>
                    </div>
                    {addMemberError && <p className="text-xs text-red-500 mt-1.5">{addMemberError}</p>}
                  </div>
                )}
              </div>

              {/* AI Model Settings */}
              <div className="px-4 py-4 border-b border-slate-100">
                <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">AI Model Settings</h4>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  Configure params for each model. Settings are remembered per conversation. Use <span className="font-mono text-violet-500">@Rify</span> in chat to invoke.
                </p>

                {/* Model selector */}
                <div className="mb-3">
                  <div className="relative">
                    <select
                      value={detailModel}
                      onChange={(e) => setDetailModel(e.target.value)}
                      className="w-full text-xs bg-slate-100 rounded-lg px-3 py-2 outline-none text-slate-700 border border-transparent focus:border-violet-300 appearance-none pr-7"
                    >
                      {TEXT_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({calculateCreditCost(m.id)} cr)</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Params for selected model */}
                {(() => {
                  const modelDef = TEXT_MODELS.find((m) => m.id === detailModel)
                  const params = modelDef?.params ?? []
                  const stored = getModelParams(currentRoomId, detailModel)
                  if (params.length === 0) {
                    return <p className="text-[11px] text-slate-300 italic">No configurable params for this model.</p>
                  }
                  return (
                    <div className="space-y-2">
                      {params.map((p) => (
                        <div key={p.key} className="flex items-center justify-between gap-2">
                          <label className="text-xs text-slate-500 flex-shrink-0 w-[90px]">{p.label}</label>
                          <div className="relative flex-1">
                            <select
                              value={stored[p.key] ?? p.default}
                              onChange={(e) => setModelParam(currentRoomId, detailModel, p.key, e.target.value)}
                              className="w-full text-xs bg-slate-100 rounded-lg px-2 py-1.5 outline-none text-slate-700 border border-transparent focus:border-violet-300 appearance-none pr-6"
                            >
                              {p.options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                            <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* Danger zone */}
              <div className="px-4 py-4 space-y-2">
                {/* Leave (non-owners only) */}
                {!isOwner && (
                  <button
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-all"
                    onClick={handleLeave}
                  >
                    <LogOut size={14} /> Leave Conversation
                  </button>
                )}

                {/* Dissolve (owner only) */}
                {isOwner && !confirmDissolve && (
                  <button
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-red-200 text-red-500 text-sm hover:bg-red-50 transition-all"
                    onClick={() => setConfirmDissolve(true)}
                  >
                    <Trash2 size={14} /> Dissolve Room
                  </button>
                )}

                {/* Confirm dissolve */}
                {isOwner && confirmDissolve && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={14} className="text-red-500 flex-shrink-0" />
                      <p className="text-xs font-semibold text-red-700">Dissolve this room?</p>
                    </div>
                    <p className="text-[11px] text-red-600 mb-3 leading-relaxed">
                      All messages and members will be permanently deleted. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="flex-1 py-1.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors"
                        onClick={handleDissolve}
                      >
                        Yes, dissolve
                      </button>
                      <button
                        className="flex-1 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors"
                        onClick={() => setConfirmDissolve(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Resize handle */}
      <div
        className={cn(
          "absolute right-0 top-0 h-full w-1.5 cursor-col-resize z-30",
          "bg-transparent",
          !effectiveOpen && "pointer-events-none"
        )}
        onPointerDown={handleResizeStart}
        title="Drag to resize sidebar"
      />
    </aside>
  )
}
