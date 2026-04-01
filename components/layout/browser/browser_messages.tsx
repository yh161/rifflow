"use client"

import { useState, useEffect, useRef } from "react"
import { ChevronLeft, ChevronDown, ChevronRight, Send, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Contact {
  id: string
  name: string | null
  image: string | null
}

interface Conversation {
  contactId: string
  contact: Contact
  lastMessage: { content: string; createdAt: string; isMe: boolean }
  unreadCount: number
  isMutual: boolean
}

interface Message {
  id: string
  senderId: string
  content: string
  read: boolean
  createdAt: string
  isMe: boolean
}

interface MessagesPageProps {
  onBack: () => void
  initialContactId?: string | null
  onOpenProfile?: (userId: string) => void
  onRead?: () => void
}

export function MessagesPage({ onBack, initialContactId, onOpenProfile, onRead }: MessagesPageProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeContact, setActiveContact] = useState<Contact | null>(null)
  const [activeMutual, setActiveMutual] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState("")
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [strangersOpen, setStrangersOpen] = useState(false)
  const [strangerLimitReached, setStrangerLimitReached] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load conversation list
  useEffect(() => {
    fetch("/api/messages")
      .then((r) => r.json())
      .then((data) => {
        const convs: Conversation[] = data.conversations ?? []
        setConversations(convs)
        onRead?.()
        // Auto-open initial contact
        if (initialContactId) {
          const conv = convs.find((c) => c.contactId === initialContactId)
          if (conv) {
            openChat(conv.contact, conv.isMutual)
          } else {
            // New conversation — fetch contact info from profile
            fetch(`/api/user/${initialContactId}/profile`)
              .then((r) => r.json())
              .then((pData) => {
                if (pData.profile) {
                  openChat(
                    { id: pData.profile.id, name: pData.profile.name, image: pData.profile.image },
                    false
                  )
                }
              })
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openChat = (contact: Contact, mutual: boolean) => {
    // Skip re-fetch if already viewing this conversation
    if (activeContact?.id === contact.id) return
    setActiveContact(contact)
    setActiveMutual(mutual)
    setStrangerLimitReached(false)
    setMessages([])
    fetch(`/api/messages/${contact.id}`)
      .then((r) => r.json())
      .then((data) => {
        setMessages(data.messages ?? [])
        // If stranger, check if we've already sent 1 message
        if (!mutual) {
          const sentByMe = (data.messages ?? []).filter((m: Message) => m.isMe).length
          if (sentByMe >= 1) setStrangerLimitReached(true)
        }
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
      })
  }

  const handleSend = async () => {
    if (!activeContact || !inputValue.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/messages/${activeContact.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: inputValue.trim() }),
      })
      if (res.ok) {
        const { message } = await res.json()
        setMessages((prev) => [...prev, message])
        setInputValue("")
        if (!activeMutual) setStrangerLimitReached(true)
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
        // Update conversations list
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.contactId === activeContact.id)
          const updated = { content: message.content, createdAt: message.createdAt, isMe: true }
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = { ...next[idx], lastMessage: updated }
            return next
          }
          return [{ contactId: activeContact.id, contact: activeContact, lastMessage: updated, unreadCount: 0, isMutual: activeMutual }, ...prev]
        })
      } else {
        const err = await res.json()
        if (err.error === "STRANGER_LIMIT") setStrangerLimitReached(true)
      }
    } finally {
      setSending(false)
    }
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" })
    return d.toLocaleDateString([], { month: "short", day: "numeric" })
  }

  const mutualConvs = conversations.filter((c) => c.isMutual)
  const strangerConvs = conversations.filter((c) => !c.isMutual)
  const strangerUnread = strangerConvs.reduce((sum, c) => sum + c.unreadCount, 0)

  const ConvItem = ({ conv }: { conv: Conversation }) => (
    <button
      key={conv.contactId}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/80 transition-colors text-left",
        activeContact?.id === conv.contactId && "bg-muted"
      )}
      onClick={() => openChat(conv.contact, conv.isMutual)}
    >
      {conv.contact.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={conv.contact.image}
          alt=""
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-sm font-semibold text-muted-foreground">
          {(conv.contact.name ?? "?")[0].toUpperCase()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm truncate">{conv.contact.name ?? "Unknown"}</span>
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {formatTime(conv.lastMessage.createdAt)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground truncate">
            {conv.lastMessage.isMe && <span className="text-muted-foreground/70">You: </span>}
            {conv.lastMessage.content}
          </p>
          {conv.unreadCount > 0 && (
            <span className="ml-2 flex-shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
              {conv.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Conversation list ── */}
      <div className={cn(
        "flex flex-col border-r bg-muted/30 w-[280px] flex-shrink-0",
        activeContact && "hidden sm:flex"
      )}>
        <div className="px-4 py-3 border-b h-[57px] flex items-center">
          <h2 className="font-semibold text-lg">Messages</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Mutual follow conversations */}
          {mutualConvs.length === 0 && strangerConvs.length === 0 && !loading && (
            <p className="text-center text-muted-foreground text-sm py-8">No conversations yet</p>
          )}
          {mutualConvs.map((conv) => <ConvItem key={conv.contactId} conv={conv} />)}

          {/* Strangers section */}
          {strangerConvs.length > 0 && (
            <>
              <button
                className="w-full flex items-center gap-2 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors border-t mt-1"
                onClick={() => setStrangersOpen((v) => !v)}
              >
                {strangersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <span>Message Requests</span>
                {strangerUnread > 0 && (
                  <span className="ml-auto flex-shrink-0 w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center">
                    {strangerUnread}
                  </span>
                )}
              </button>
              {strangersOpen && strangerConvs.map((conv) => <ConvItem key={conv.contactId} conv={conv} />)}
            </>
          )}
        </div>
      </div>

      {/* ── Chat area ── */}
      <div className="flex-1 flex flex-col">
        {activeContact ? (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 border-b h-[57px]">
              <button
                className="sm:hidden text-muted-foreground"
                onClick={() => setActiveContact(null)}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                onClick={() => onOpenProfile?.(activeContact.id)}
              >
                {activeContact.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeContact.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                    {(activeContact.name ?? "?")[0].toUpperCase()}
                  </div>
                )}
                <span className="font-medium text-sm">{activeContact.name ?? "Unknown"}</span>
              </button>
              {!activeMutual && (
                <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                  Request
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn("flex", msg.isMe ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-4 py-2 text-sm",
                      msg.isMe
                        ? "bg-blue-500 text-white rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={cn(
                      "text-[10px] mt-1",
                      msg.isMe ? "text-white/60" : "text-muted-foreground"
                    )}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t px-4 py-3">
              {strangerLimitReached ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-xl px-4 py-3">
                  <UserPlus className="h-4 w-4 flex-shrink-0" />
                  <span>Follow each other to continue chatting.</span>
                </div>
              ) : (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => { e.preventDefault(); handleSend() }}
                >
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={activeMutual ? "Type a message..." : "Send 1 message to introduce yourself…"}
                    className="flex-1 rounded-full bg-muted/50 border-none"
                    maxLength={2000}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="rounded-full h-9 w-9"
                    disabled={!inputValue.trim() || sending}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  )
}
