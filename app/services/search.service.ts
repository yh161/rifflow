/**
 * Search Service
 *
 * Architecture overview:
 *  ┌─────────────────────────────────────────────┐
 *  │               SearchService                 │
 *  │  - orchestrates multi-entity search         │
 *  │  - delegates scoring to a SearchRanker      │
 *  └──────────────┬──────────────────────────────┘
 *                 │ uses
 *  ┌──────────────▼──────────────────────────────┐
 *  │  SearchRanker<T>  (interface / strategy)    │
 *  │  - rank(items, query): T[]                  │
 *  │  Current implementation: DefaultSearchRanker │
 *  │  Future: MLSearchRanker, PersonalisedRanker │
 *  └─────────────────────────────────────────────┘
 *
 * To plug in a new ranking algorithm:
 *   1. Implement SearchRanker<WorkflowHit> and/or SearchRanker<UserHit>
 *   2. Pass it to SearchService constructor (or swap the exported singleton)
 */

import { prisma } from "@/lib/prisma"
import { favoriteRepository } from "@/app/repositories/community.repository"

// ─── Hit types returned to the client ────────────────────────────────────────

export interface WorkflowHit {
  id: string
  name: string
  description: string | null
  thumbnail: string | null
  category: string
  tags: string[]
  pricingType: string
  priceInPoints: number | null
  executionsCount: number
  favoritesCount: number
  rating: number
  isFeatured: boolean
  publishedAt: string | null
  creatorId: string
  isFavorited: boolean
  creator: { id: string; name: string | null; image: string | null }
  /** Ranking score – higher = more relevant */
  _score: number
}

export interface UserHit {
  id: string
  name: string | null
  image: string | null
  isCreator: boolean
  bio: string | null
  followersCount: number
  publishedCount: number
  /** Ranking score – higher = more relevant */
  _score: number
}

export interface SearchResults {
  workflows: WorkflowHit[]
  users: UserHit[]
  meta: {
    query: string
    workflowsTotal: number
    usersTotal: number
  }
}

// ─── Ranker strategy interface ────────────────────────────────────────────────

/**
 * Implement this interface to swap in a different ranking strategy.
 * The ranker receives the DB results (already text-filtered) and re-orders
 * them by relevance.  This is the seam for future ML / personalisation work.
 */
export interface SearchRanker<T> {
  rank(items: T[], query: string): T[]
}

// ─── Default ranker  (simple TF-style lexical scoring) ───────────────────────

/**
 * DefaultWorkflowRanker
 *
 * Scoring criteria (additive):
 *  +3.0  exact name match  (case-insensitive)
 *  +2.0  name starts with query
 *  +1.5  name contains query
 *  +1.0  any tag is an exact match
 *  +0.5  description contains query
 *  +0.5  normalised executionsCount  (log scale, max 0.5)
 *  +0.3  normalised favoritesCount   (log scale, max 0.3)
 *  +0.2  normalised rating           (0-5 → 0-0.2)
 *  +0.3  isFeatured bonus
 */
class DefaultWorkflowRanker implements SearchRanker<WorkflowHit> {
  rank(items: WorkflowHit[], query: string): WorkflowHit[] {
    const q = query.toLowerCase().trim()
    if (!q) return items

    const maxExec = Math.max(...items.map((i) => i.executionsCount), 1)
    const maxFavs = Math.max(...items.map((i) => i.favoritesCount), 1)

    const scored = items.map((item) => {
      const nameLower = (item.name ?? "").toLowerCase()
      const descLower = (item.description ?? "").toLowerCase()
      let score = 0

      if (nameLower === q)              score += 3.0
      else if (nameLower.startsWith(q)) score += 2.0
      else if (nameLower.includes(q))   score += 1.5

      if (item.tags.some((t) => t.toLowerCase() === q)) score += 1.0
      if (descLower.includes(q))                        score += 0.5

      // Popularity signals (log-normalised)
      score += 0.5 * (Math.log1p(item.executionsCount) / Math.log1p(maxExec))
      score += 0.3 * (Math.log1p(item.favoritesCount)  / Math.log1p(maxFavs))
      score += 0.2 * (item.rating / 5)
      if (item.isFeatured) score += 0.3

      return { ...item, _score: score }
    })

    return scored.sort((a, b) => b._score - a._score)
  }
}

/**
 * DefaultUserRanker
 *
 * Scoring criteria (additive):
 *  +3.0  exact name match
 *  +2.0  name starts with query
 *  +1.5  name contains query
 *  +0.5  bio contains query
 *  +0.4  normalised followersCount (log scale)
 *  +0.2  isCreator bonus
 */
class DefaultUserRanker implements SearchRanker<UserHit> {
  rank(items: UserHit[], query: string): UserHit[] {
    const q = query.toLowerCase().trim()
    if (!q) return items

    const maxFollowers = Math.max(...items.map((i) => i.followersCount), 1)

    const scored = items.map((item) => {
      const nameLower = (item.name ?? "").toLowerCase()
      const bioLower  = (item.bio  ?? "").toLowerCase()
      let score = 0

      if (nameLower === q)              score += 3.0
      else if (nameLower.startsWith(q)) score += 2.0
      else if (nameLower.includes(q))   score += 1.5

      if (bioLower.includes(q)) score += 0.5

      score += 0.4 * (Math.log1p(item.followersCount) / Math.log1p(maxFollowers))
      if (item.isCreator)    score += 0.2
      if (item.publishedCount > 0) score += 0.1 * Math.min(item.publishedCount / 10, 1)

      return { ...item, _score: score }
    })

    return scored.sort((a, b) => b._score - a._score)
  }
}

// ─── Search Service ───────────────────────────────────────────────────────────

export interface SearchOptions {
  query: string
  /** "all" | "workflows" | "users" */
  type?: "all" | "workflows" | "users"
  limit?: number
  /** ID of the requesting user (for favorite status) */
  userId?: string | null
  /** Override rankers for A/B testing or feature flags */
  workflowRanker?: SearchRanker<WorkflowHit>
  userRanker?: SearchRanker<UserHit>
}

export class SearchService {
  private defaultWorkflowRanker: SearchRanker<WorkflowHit>
  private defaultUserRanker: SearchRanker<UserHit>

  constructor(
    workflowRanker?: SearchRanker<WorkflowHit>,
    userRanker?: SearchRanker<UserHit>,
  ) {
    this.defaultWorkflowRanker = workflowRanker ?? new DefaultWorkflowRanker()
    this.defaultUserRanker     = userRanker     ?? new DefaultUserRanker()
  }

  async search(opts: SearchOptions): Promise<SearchResults> {
    const {
      query,
      type = "all",
      limit = 20,
      userId = null,
      workflowRanker = this.defaultWorkflowRanker,
      userRanker = this.defaultUserRanker,
    } = opts

    const q = query.trim()
    if (!q) {
      return {
        workflows: [],
        users: [],
        meta: { query: q, workflowsTotal: 0, usersTotal: 0 },
      }
    }

    const [workflowHits, userHits] = await Promise.all([
      type !== "users"     ? this._searchWorkflows(q, limit, userId, workflowRanker) : [],
      type !== "workflows" ? this._searchUsers(q, limit, userRanker)                 : [],
    ])

    return {
      workflows: workflowHits,
      users: userHits,
      meta: {
        query: q,
        workflowsTotal: workflowHits.length,
        usersTotal: userHits.length,
      },
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _searchWorkflows(
    query: string,
    limit: number,
    userId: string | null,
    ranker: SearchRanker<WorkflowHit>,
  ): Promise<WorkflowHit[]> {
    const rows = await prisma.template.findMany({
      where: {
        status: "published",
        OR: [
          { name:        { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { tags:        { has: query } },
          { category:    { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit * 3, // fetch more so ranker has room to reorder
      orderBy: { executionsCount: "desc" },
      select: {
        id: true, name: true, description: true, thumbnail: true,
        category: true, tags: true, pricingType: true, priceInPoints: true,
        executionsCount: true, favoritesCount: true, rating: true,
        isFeatured: true, publishedAt: true, creatorId: true,
        creator: { select: { id: true, name: true, image: true } },
      },
    })

    // Check favorites
    let favSet = new Set<string>()
    if (userId && rows.length > 0) {
      favSet = await favoriteRepository.checkBatch(userId, rows.map((r) => r.id))
    }

    const hits: WorkflowHit[] = rows.map((r) => ({
      ...r,
      rating: Number(r.rating),
      publishedAt: r.publishedAt?.toISOString() ?? null,
      isFavorited: favSet.has(r.id),
      _score: 0,
    }))

    return ranker.rank(hits, query).slice(0, limit)
  }

  private async _searchUsers(
    query: string,
    limit: number,
    ranker: SearchRanker<UserHit>,
  ): Promise<UserHit[]> {
    const rows = await prisma.user.findMany({
      where: {
        OR: [
          { name:       { contains: query, mode: "insensitive" } },
          { creatorBio: { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit * 3,
      select: {
        id: true,
        name: true,
        image: true,
        isCreator: true,
        creatorBio: true,
        _count: {
          select: {
            followers: true,
            createdTemplates: { where: { status: "published" } },
          },
        },
      },
    })

    const hits: UserHit[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      image: r.image,
      isCreator: r.isCreator,
      bio: r.creatorBio,
      followersCount: r._count.followers,
      publishedCount: r._count.createdTemplates,
      _score: 0,
    }))

    return ranker.rank(hits, query).slice(0, limit)
  }
}

// ─── Singleton (shared rankers, easily swapped via env or feature flags) ──────
export const searchService = new SearchService()
