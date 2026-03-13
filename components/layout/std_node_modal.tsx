"use client"

import React from 'react'
import { Node } from 'reactflow'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { cn } from '@/lib/utils'

import { MODULE_BY_ID } from './modules/_registry'
import type { AnyNodeData, ModuleModalProps } from './modules/_types'

interface EditorModalProps {
  isOpen: boolean
  onClose: () => void
  element: Node<AnyNodeData> | undefined
  onUpdate: (data: Partial<AnyNodeData>) => void
  onConfirm?: () => void
  onDelete?: () => void
}

function resolveModuleId(element: Node<AnyNodeData>): string {
  if (element.type === 'StandardNode') return 'entity'
  if (element.type === 'CustomNode')   return element.data.type ?? ''
  return ''
}

const MODAL_WIDTH: Record<string, string> = {
  entity: 'sm:max-w-[720px]',
}

/**
 * EditorModal — now only used for StandardNode (entity) modals.
 * Text and image nodes are edited via the inline NodeEditor (node_editor.tsx).
 * Returns null early for text/image module IDs so nothing renders.
 */
export function EditorModal({
  isOpen,
  onClose,
  element,
  onUpdate,
  onConfirm,
  onDelete,
}: EditorModalProps) {
  if (!element) return null

  const moduleId = resolveModuleId(element)

  // Text and image nodes are handled by the inline NodeEditor — skip modal entirely
  if (moduleId === 'text' || moduleId === 'image') return null

  const mod = MODULE_BY_ID[moduleId]
  if (!mod) return null

  const modalProps: ModuleModalProps = {
    data: element.data as AnyNodeData,
    onUpdate,
    onConfirm,
    onClose,
    onDelete,
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          'w-[90vw] max-h-[90vh] overflow-y-auto transition-all duration-300',
          MODAL_WIDTH[moduleId] ?? 'sm:max-w-[450px]',
        )}
      >
        <VisuallyHidden>
          <DialogTitle>
            {element.data.name || element.data.label || mod.meta.name}
          </DialogTitle>
        </VisuallyHidden>

        <mod.ModalContent {...modalProps} />
      </DialogContent>
    </Dialog>
  )
}