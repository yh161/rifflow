
import React from "react"
import { NodePickerMenu } from "@/components/layout/node_picker"

interface QuickAddMenuProps {
  flowPos: { x: number; y: number }
  sourceNodeId?: string
  sourceHandleId?: string
  favorites: string[]
  onToggleFavorite: (typeId: string) => void
  onSelect: (type: string) => void
  onDismiss: () => void
  menuLeft: number
  menuTop: number
}

export function QuickAddMenu({
  flowPos,
  sourceNodeId,
  sourceHandleId,
  favorites,
  onToggleFavorite,
  onSelect,
  onDismiss,
  menuLeft,
  menuTop,
}: QuickAddMenuProps) {
  return (
    <NodePickerMenu
      closeMode="outside"
      onSelect={onSelect}
      onDismiss={onDismiss}
      favorites={favorites}
      onToggleFavorite={onToggleFavorite}
      showArrow={!!sourceNodeId}
      left={menuLeft}
      top={menuTop}
    />
  )
}