// Draft service layer

import { RiffDraftRepository } from "@/app/repositories/riffDraft.repository"
import { IRiffDraftRepository } from "@/app/repositories/types"
import { Prisma } from "@prisma/client"
import { normalizeDraftNode } from "@/lib/draft-assets"

// ─────────────────────────────────────────────
// Sanitize a single node before persisting to the database.
// Strips ephemeral blob: URLs (session-only) and non-serialisable fields
// (File objects, callbacks) so the stored draft is always safe to reload.
// ─────────────────────────────────────────────
function sanitizeNode(node: Prisma.JsonValue): Prisma.JsonValue {
  return normalizeDraftNode(node, {
    stripEphemeral: true,
    stripRuntimeFields: true,
  }) as Prisma.JsonValue
}

const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 }

function parseFavorites(v: Prisma.JsonValue): string[] {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return []
  const vp = v as Record<string, Prisma.JsonValue>
  const raw = vp.favorites
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === "string")
}

function parseViewport(v: Prisma.JsonValue): { x: number; y: number; zoom: number } {
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const vp = v as Record<string, Prisma.JsonValue>
    if (typeof vp.x === "number" && typeof vp.y === "number" && typeof vp.zoom === "number") {
      return { x: vp.x, y: vp.y, zoom: vp.zoom }
    }
  }
  return DEFAULT_VIEWPORT
}

export interface DraftData {
  nodes:    Prisma.JsonValue[]
  edges:    Prisma.JsonValue[]
  viewport: { x: number; y: number; zoom: number }
  favorites: string[]
  consoleOpen: boolean
}

export interface DraftResult {
  success: boolean
  data?: DraftData
  error?: string
}

export class DraftService {
  private draftRepository: IRiffDraftRepository

  constructor(draftRepository?: IRiffDraftRepository) {
    this.draftRepository = draftRepository || new RiffDraftRepository()
  }

  async getDraftByUserId(userId: string): Promise<DraftResult> {
    try {
      const draft = await this.draftRepository.findByUserId(userId)

      if (!draft) {
        return {
          success: true,
          data: { nodes: [], edges: [], viewport: DEFAULT_VIEWPORT, favorites: [], consoleOpen: false }
        }
      }

      const nodesRaw = Array.isArray(draft.nodesJson) ? draft.nodesJson : []
      const nodes = nodesRaw.map((n) =>
        normalizeDraftNode(n, {
          stripEphemeral: false,
          stripRuntimeFields: false,
        }) as Prisma.JsonValue,
      )
      const edges    = Array.isArray(draft.edgesJson) ? draft.edgesJson : []
      const viewport = parseViewport(draft.viewportJson)
      const favorites = parseFavorites(draft.viewportJson)
      const consoleOpen =
        typeof draft.viewportJson === "object" &&
        draft.viewportJson !== null &&
        !Array.isArray(draft.viewportJson) &&
        typeof (draft.viewportJson as Record<string, Prisma.JsonValue>).consoleOpen === "boolean"
          ? (draft.viewportJson as Record<string, Prisma.JsonValue>).consoleOpen as boolean
          : false

      return {
        success: true,
        data: { nodes, edges, viewport, favorites, consoleOpen }
      }
    } catch (error: unknown) {
      console.error("[DraftService] getDraftByUserId failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load draft"
      }
    }
  }

  async saveDraft(
    userId:   string,
    nodes:    Prisma.JsonValue[],
    edges:    Prisma.JsonValue[],
    viewport: { x: number; y: number; zoom: number },
    favorites: string[],
    consoleOpen: boolean,
  ): Promise<DraftResult> {
    try {
      if (!Array.isArray(nodes) || !Array.isArray(edges)) {
        return {
          success: false,
          error: "Invalid draft data format"
        }
      }

      const cleanNodes = nodes.map(sanitizeNode)

      await this.draftRepository.upsertByUserId(userId, {
        user: { connect: { id: userId } },
        nodesJson:    cleanNodes as Prisma.InputJsonValue,
        edgesJson:    edges     as Prisma.InputJsonValue,
        viewportJson: { ...viewport, favorites, consoleOpen } as unknown as Prisma.InputJsonValue,
      })

      return { success: true }
    } catch (error: unknown) {
      console.error("[DraftService] saveDraft failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to save draft"
      }
    }
  }

  async deleteDraft(userId: string): Promise<DraftResult> {
    try {
      const draft = await this.draftRepository.findByUserId(userId)
      if (draft && draft.id) {
        await this.draftRepository.delete(draft.id)
      }

      return { success: true }
    } catch (error: unknown) {
      console.error("[DraftService] deleteDraft failed:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete draft"
      }
    }
  }
}
