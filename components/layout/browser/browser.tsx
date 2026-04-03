"use client"

import React from "react"
import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
} from "@/components/ui/menubar"

import {
  PanelLeftOpen,
  Zap,
  User,
  Search,
  PlayCircle,
  LayoutGrid,
  GitBranch,
  Clock,
  Users,
  HardDrive,
  Workflow,
  Star,
} from "lucide-react"

// Sub-page components
import { P1 } from "./browser_p1"
import { P2 } from "./browser_p2"
import { P3 } from "./browser_p3"
import { LibraryPage } from "./browser_library"
import { FavoritesPage } from "./browser_favorites"
import { AccountPage } from "./browser_account"
import { PricingPage } from "./browser_pricing"
import { WorkflowDetailPage } from "./browser_detail"
import { ProfilePage } from "./browser_profile"
import type { TemplateSummary } from "./community.types"


interface PanelProps {
  isSidebarOpen?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  isRunning?: boolean
  importRef?: React.MutableRefObject<(() => void) | null>
  exportRef?: React.MutableRefObject<(() => void) | null>
  currentEditingDraftId?: string | null
}

export default function Panel({ isSidebarOpen = true, isOpen = true, onOpenChange, isRunning = false, importRef, exportRef, currentEditingDraftId }: PanelProps) {
  const setIsOpen = (val: boolean) => onOpenChange?.(val)
  const [activePage, setActivePage] = useState<"watch" | "browse" | "create" | "library" | "favorites" | "account" | "pricing" | "detail" | "profile">("watch")
  const [libraryTab, setLibraryTab] = useState<"recent" | "assets" | "creators">("recent")
  const [prevPage, setPrevPage]     = useState<typeof activePage>("watch")
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSummary | null>(null)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  const navigate = (page: typeof activePage) => {
    setPrevPage(activePage)
    setActivePage(page)
  }

  const handleOpenDetail = (template: TemplateSummary) => {
    setSelectedTemplate(template)
    navigate("detail")
  }

  const handleOpenProfile = (userId: string) => {
    setProfileUserId(userId)
    navigate("profile")
  }

  // Avatar click → open panel + profile page (my profile)
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      setIsOpen(true)
      if (detail?.userId) {
        setProfileUserId(detail.userId)
        navigate("profile")
      } else {
        navigate("account")
      }
    }
    window.addEventListener("navigate:account", handler)
    return () => window.removeEventListener("navigate:account", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage])

  // Navigate to profile from anywhere
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.userId) {
        setIsOpen(true)
        handleOpenProfile(detail.userId)
      }
    }
    window.addEventListener("navigate:profile", handler)
    return () => window.removeEventListener("navigate:profile", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage])

  // Fullscreen pages (no sidebar)
  const isFullscreen = activePage === "account" || activePage === "pricing"

  // Completely hidden during run mode — no edge, no interaction
  if (isRunning) {
    return null
  }

  return (
    <>
    <div className="md:hidden">
      <Image
        src="/examples/music-light.png"
        width={1280}
        height={1114}
        alt="Music"
        className="block dark:hidden"
      />
      <Image
        src="/examples/music-dark.png"
        width={1280}
        height={1114}
        alt="Music"
        className="hidden dark:block"
      />
    </div>
    
    <div className="hidden md:block h-screen w-full lg:p-10">
      <div 
        className={cn(
          "absolute top-4 bottom-4", 
          "overflow-hidden rounded-xl border bg-white/70 backdrop-blur-lg shadow-xl", 
          "flex flex-col",
          "transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
          !isOpen && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900"
        )}
        onClick={() => !isOpen && setIsOpen(true)}
        style={{
          left: isSidebarOpen ? 406 : 80,
          right: 16,
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% - 6px))',
          transition: 'left 500ms cubic-bezier(0.16,1,0.3,1), right 500ms cubic-bezier(0.16,1,0.3,1), transform 500ms cubic-bezier(0.3, 1.15, 0.3, 1)',
        }}
      >
        {/* --- Top Menubar --- */}
        <Menubar className="rounded-none border-b border-none px-2 lg:px-4 bg-white/70 backdrop-blur-lg">
          <MenubarMenu>
            <MenubarTrigger
              className="font-bold"
              onClick={() => navigate("watch")}
            >
              Navigator
            </MenubarTrigger>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger onClick={() => navigate("account")}>
              <User className="h-3.5 w-3.5 mr-1" />
              Account
            </MenubarTrigger>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger onClick={() => navigate("pricing")}>
              <Zap className="h-3.5 w-3.5 mr-1 text-blue-500" />
              Pricing Plans
            </MenubarTrigger>
          </MenubarMenu>
        
          <button 
            className="absolute right-2 top-[2px] z-50 p-2 text-slate-500"
            onClick={() => setIsOpen(!isOpen)} 
          >
            <PanelLeftOpen 
              size={18} 
              className={cn("transition-transform duration-500")} 
            />
          </button>
        </Menubar>

        {/* --- Main Layout --- */}
        <div className={cn("flex flex-col border-t bg-white/70 h-[calc(100vh-100px)]", isFullscreen && "h-[calc(100dvh-80px)]")}>
          <div className={cn("flex flex-1 min-h-0", !isFullscreen && "lg:grid lg:grid-cols-5")}>
            {/* --- Left Sidebar (Menu) — hidden on fullscreen pages --- */}
            {!isFullscreen && (
              <aside className="hidden lg:flex flex-col h-full border-r">
                <div className="px-6 py-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="pl-9 rounded-lg bg-slate-100/50 dark:bg-slate-900/50 border-none h-9 focus-visible:ring-1 focus-visible:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-4 pb-4">

                  {/* --- Discover section --- */}
                  <div className="px-2 py-2">
                    <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                      Discover
                    </h2>
                    <div className="space-y-1">
                      <Button 
                        variant={activePage === "watch" ? "secondary" : "ghost"} 
                        className="w-full justify-start"
                        onClick={() => setActivePage("watch")}
                      >
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Start Now
                      </Button>
                      <Button 
                        variant={activePage === "browse" ? "secondary" : "ghost"} 
                        className="w-full justify-start"
                        onClick={() => setActivePage("browse")}
                      >
                        <LayoutGrid className="mr-2 h-4 w-4" />
                        Browse
                      </Button>
                      <Button 
                        variant={activePage === "create" ? "secondary" : "ghost"} 
                        className="w-full justify-start"
                        onClick={() => setActivePage("create")}
                      >
                        <GitBranch className="mr-2 h-4 w-4" />
                        Create
                      </Button>
                    </div>
                  </div>

                  {/* --- Library section --- */}
                  <div className="px-2 py-2">
                    <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                      Library
                    </h2>
                    <div className="space-y-1">
                      <Button 
                        variant={activePage === "library" && libraryTab === "recent" ? "secondary" : "ghost"} 
                        className="w-full justify-start" 
                        onClick={() => { setLibraryTab("recent"); setActivePage("library") }}
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Recently Added
                      </Button>
                      <Button 
                        variant={activePage === "library" && libraryTab === "creators" ? "secondary" : "ghost"} 
                        className="w-full justify-start" 
                        onClick={() => { setLibraryTab("creators"); setActivePage("library") }}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Creators
                      </Button>
                      <Button 
                        variant={activePage === "library" && libraryTab === "assets" ? "secondary" : "ghost"} 
                        className="w-full justify-start" 
                        onClick={() => { setLibraryTab("assets"); setActivePage("library") }}
                      >
                        <HardDrive className="mr-2 h-4 w-4" />
                        Assets
                      </Button>
                    </div>
                  </div>

                  {/* --- Workflows list section --- */}
                  <div className="px-2 py-2">
                    <h2 className="relative px-4 text-lg font-semibold tracking-tight mb-2">
                      Workflows
                    </h2>
                    <div className="space-y-1">
                      {/* Pinned items */}
                      <Button variant="ghost" className="w-full justify-start font-normal">
                        <Workflow className="mr-2 h-4 w-4" />
                        All Workflows
                      </Button>
                      <Button variant={activePage === "favorites" ? "secondary" : "ghost"} className="w-full justify-start font-normal" onClick={() => setActivePage("favorites")}>
                        <Star className="mr-2 h-4 w-4" />
                        Favorites
                      </Button>
                    </div>
                  </div>

                </div>
              </aside>
            )}

            {/* --- Right Content Area --- */}
            <div className={cn(
              "flex-1 flex flex-col min-h-0",
              !isFullscreen && "lg:col-span-4"
            )}>
              <div className={cn("flex-1 overflow-y-auto min-h-0", !["detail", "profile"].includes(activePage) && "px-4 py-6 lg:px-8")}>
                {activePage === "watch"     && <P1 onOpenDetail={handleOpenDetail} />}
                {activePage === "browse"    && <P2 />}
                {activePage === "create"    && <P3 currentEditingDraftId={currentEditingDraftId} importRef={importRef} />}
                {activePage === "library"   && <LibraryPage defaultTab={libraryTab} onTabChange={setLibraryTab} />}
                {activePage === "favorites" && <FavoritesPage />}
                {activePage === "account"   && <AccountPage onPricing={() => navigate("pricing")} />}
                {activePage === "pricing"   && <PricingPage />}
                {activePage === "detail" && selectedTemplate && (
                  <WorkflowDetailPage
                    template={selectedTemplate}
                    onBack={() => setActivePage(prevPage)}
                    onOpenProfile={handleOpenProfile}
                  />
                )}
                {activePage === "profile" && profileUserId && (
                  <ProfilePage
                    userId={profileUserId}
                    onBack={() => setActivePage(prevPage)}
                    onOpenDetail={handleOpenDetail}
                    onOpenChat={(id) => {
                      // Route chat to the sidebar instead of browser panel
                      window.dispatchEvent(new CustomEvent("sidebar:openChat", { detail: { contactId: id } }))
                    }}
                    unreadCount={0}
                  />
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </>
  )
}