"use client"

import React from "react"
import { Upload, Download } from "lucide-react"
import { ActionButton } from "../../node_editor/_action_bar"
import type { ActionBarProps } from "../_action_bar_types"

export function ActionBarContent({ onUpload, onDownload }: ActionBarProps) {
  return (
    <>
      <ActionButton icon={Upload}   label="Upload"   onClick={onUpload} />
      <ActionButton icon={Download} label="Download" onClick={onDownload} />
    </>
  )
}
