"use client"

import React from "react"
import Image from "next/image"
import { useState } from "react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar"

import {
  Globe,
  LayoutGrid,
  PanelLeftOpen,
  PlayCircle,
  Mic,
  Search,
  GitBranch,
  Clock,
  Users,
  Layers,
  HardDrive,
  Workflow,
  Star,
  Folder,
  FolderOpen,
  Video,
  Zap,
  ChevronLeft,
} from "lucide-react"

// Sub-page components
import { P1 } from "./browser_p1"
import { P2 } from "./browser_p2"
import { P3 } from "./browser_p3"
import { LibraryPage } from "./browser_library"
import { FavoritesPage } from "./browser_favorites"
import { AccountPage } from "./browser_account"
import { PricingPage } from "./browser_pricing"

// User-defined workflow collections (analogous to user-created playlists in Apple Music)
const workflowCollections = [
  { name: "电商内容生产线", icon: Folder },
  { name: "短视频矩阵", icon: Folder },
  { name: "品牌素材库", icon: FolderOpen },
  { name: "营销自动化", icon: Folder },
  { name: "年终汇报套装", icon: Folder },
  { name: "客服话术生成", icon: Folder },
]

interface PanelProps {
  isSidebarOpen?: boolean
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
  isRunning?: boolean
  importRef?: React.MutableRefObject<(() => void) | null>
  exportRef?: React.MutableRefObject<(() => void) | null>
}

export default function Panel({ isSidebarOpen = true, isOpen = true, onOpenChange, isRunning = false, importRef, exportRef }: PanelProps) {
  const setIsOpen = (val: boolean) => onOpenChange?.(val)
  const [activePage, setActivePage] = useState<"watch" | "browse" | "create" | "library" | "favorites" | "account" | "pricing">("watch")
  const [prevPage, setPrevPage]     = useState<typeof activePage>("watch")

  const navigate = (page: typeof activePage) => {
    setPrevPage(activePage)
    setActivePage(page)
  }

  // Avatar click → account page
  React.useEffect(() => {
    const handler = () => navigate("account")
    window.addEventListener("navigate:account", handler)
    return () => window.removeEventListener("navigate:account", handler)
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
    
    <div className="hidden md:block h-screen w-full bg-background lg:p-10">
      <div 
        className={cn(
          "absolute top-4 bottom-4", 
          "overflow-hidden rounded-xl border bg-background shadow-xl", 
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
        <Menubar className="rounded-none border-b border-none px-2 lg:px-4">
          <MenubarMenu>
            <MenubarTrigger
              className="font-bold"
              onClick={() => navigate("watch")}
            >
              Navigator
            </MenubarTrigger>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>File</MenubarTrigger>
            <MenubarContent>
              <MenubarItem>
                New <MenubarShortcut>⌘N</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => importRef?.current?.()}>
                Import... <MenubarShortcut>⌘O</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => exportRef?.current?.()}>
                Export... <MenubarShortcut>⌘R</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger>Edit</MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled>
                Undo <MenubarShortcut>⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>
                Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                Cut <MenubarShortcut>⌘X</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>
                Copy <MenubarShortcut>⌘C</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>
                Paste <MenubarShortcut>⌘V</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                Select All <MenubarShortcut>⌘A</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>
                Deselect All <MenubarShortcut>⇧⌘A</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                Smart Dictation...{" "}
                <MenubarShortcut>
                  <Mic className="h-4 w-4" />
                </MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                Emoji & Symbols{" "}
                <MenubarShortcut>
                  <Globe className="h-4 w-4" />
                </MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger onClick={() => navigate("account")}>Account</MenubarTrigger>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger onClick={() => navigate("pricing")}>
              <Zap className="h-3.5 w-3.5 mr-1 text-blue-500" />
              定价方案
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
        <div className="border-t bg-background">
          <div className={cn("grid", isFullscreen ? "" : "lg:grid-cols-5")}>

            {/* ── Back button row for fullscreen pages ── */}
            {isFullscreen && (
              <div className="px-4 pt-4 pb-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground -ml-1"
                  onClick={() => setActivePage(prevPage)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  返回
                </Button>
              </div>
            )}

            {/* --- Left Sidebar (Menu) — hidden on fullscreen pages --- */}
            <aside className={cn("hidden pb-12 lg:flex flex-col h-[calc(100vh-120px)]", isFullscreen && "lg:hidden")}>
              <div className="px-6 py-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    className="pl-9 rounded-lg bg-slate-100/50 dark:bg-slate-900/50 border-none h-9 focus-visible:ring-1 focus-visible:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-2 space-y-4">

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
                    <Button variant={activePage === "library" ? "secondary" : "ghost"} className="w-full justify-start" onClick={() => setActivePage("library")}>
                      <Clock className="mr-2 h-4 w-4" />
                      Recently Added
                    </Button>
                    <Button variant={activePage === "library" ? "ghost" : "ghost"} className="w-full justify-start" onClick={() => setActivePage("library")}>
                      <Users className="mr-2 h-4 w-4" />
                      Creators
                    </Button>
                    <Button variant="ghost" className="w-full justify-start" onClick={() => setActivePage("library")}>
                      <Layers className="mr-2 h-4 w-4" />
                      Collections
                    </Button>
                    <Button variant="ghost" className="w-full justify-start" onClick={() => setActivePage("library")}>
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

                    {/* Divider */}
                    <div className="my-2 mx-4 border-t border-border/50" />

                    {/* User-defined collections */}
                    {workflowCollections.map((col) => (
                      <Button key={col.name} variant="ghost" className="w-full justify-start font-normal">
                        <col.icon className="mr-2 h-4 w-4" />
                        {col.name}
                      </Button>
                    ))}
                  </div>
                </div>

              </div>
            </aside>

            {/* --- Right Content Area --- */}
            <div className={cn(
              "flex",
              isFullscreen
                ? "col-span-full h-[calc(100vh-80px)]"
                : "col-span-3 lg:col-span-4 lg:border-l h-[calc(100vh-120px)]",
            )}>
              <div className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
                {activePage === "watch"     && <P1 />}
                {activePage === "browse"    && <P2 />}
                {activePage === "create"    && <P3 />}
                {activePage === "library"   && <LibraryPage />}
                {activePage === "favorites" && <FavoritesPage />}
                {activePage === "account"   && <AccountPage onPricing={() => navigate("pricing")} />}
                {activePage === "pricing"   && <PricingPage />}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  </>
  )
}