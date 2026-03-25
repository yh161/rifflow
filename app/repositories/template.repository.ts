import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

export type TemplateWithCreator = Prisma.TemplateGetPayload<{
  include: { creator: { select: { id: true; name: true; image: true; isCreator: true } } }
}>

export type TemplateSummary = Prisma.TemplateGetPayload<{
  select: {
    id: true; name: true; description: true; thumbnail: true
    category: true; tags: true; pricingType: true; priceInPoints: true
    executionsCount: true; favoritesCount: true; rating: true
    isFeatured: true; publishedAt: true; creatorId: true
    creator: { select: { id: true; name: true; image: true } }
  }
}>

export interface TemplateListFilter {
  category?: string
  pricingType?: string
  search?: string
  isFeatured?: boolean
  creatorId?: string
  status?: string
  limit?: number
  offset?: number
  orderBy?: "newest" | "popular" | "rating"
}

export const templateRepository = {
  // ── 列表查询（不返回 canvasSnapshot）──────────────────────────────
  async list(filter: TemplateListFilter = {}): Promise<TemplateSummary[]> {
    const {
      category, pricingType, search, isFeatured,
      creatorId, limit = 20, offset = 0, orderBy = "newest",
    } = filter
    // 未指定 status 时默认只查已发布，草稿需显式传 "draft"
    const status = filter.status ?? "published"

    const where: Prisma.TemplateWhereInput = {
      status,
      ...(category && { category }),
      ...(pricingType && { pricingType }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(creatorId && { creatorId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { tags: { has: search } },
        ],
      }),
    }

    const orderByClause: Prisma.TemplateOrderByWithRelationInput =
      orderBy === "popular" ? { executionsCount: "desc" }
      : orderBy === "rating"  ? { rating: "desc" }
      : { publishedAt: "desc" }

    return prisma.template.findMany({
      where,
      orderBy: orderByClause,
      take: limit,
      skip: offset,
      select: {
        id: true, name: true, description: true, thumbnail: true,
        category: true, tags: true, pricingType: true, priceInPoints: true,
        executionsCount: true, favoritesCount: true, rating: true,
        isFeatured: true, publishedAt: true, creatorId: true,
        creator: { select: { id: true, name: true, image: true } },
      },
    })
  },

  // ── 单条（包含 canvasSnapshot，仅服务端内部使用）─────────────────
  async findById(id: string): Promise<TemplateWithCreator | null> {
    return prisma.template.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, image: true, isCreator: true } },
      },
    })
  },

  // ── 单条（不含 canvasSnapshot，安全返回给客户端）──────────────────
  async findByIdSafe(id: string): Promise<TemplateSummary | null> {
    return prisma.template.findUnique({
      where: { id },
      select: {
        id: true, name: true, description: true, thumbnail: true,
        category: true, tags: true, pricingType: true, priceInPoints: true,
        executionsCount: true, favoritesCount: true, rating: true,
        isFeatured: true, publishedAt: true, creatorId: true,
        creator: { select: { id: true, name: true, image: true } },
      },
    })
  },

  // ── 创建 ──────────────────────────────────────────────────────────
  async create(data: Prisma.TemplateCreateInput) {
    return prisma.template.create({ data })
  },

  // ── 更新（仅创作者自己可调用，在 Service 层验证身份）─────────────
  async update(id: string, data: Prisma.TemplateUpdateInput) {
    return prisma.template.update({ where: { id }, data })
  },

  // ── 发布 ──────────────────────────────────────────────────────────
  async publish(id: string) {
    return prisma.template.update({
      where: { id },
      data: { status: "published", publishedAt: new Date() },
    })
  },

  // ── 精选列表 ──────────────────────────────────────────────────────
  async featured(limit = 8): Promise<TemplateSummary[]> {
    return this.list({ isFeatured: true, limit, orderBy: "popular" })
  },

  // ── 热门列表 ──────────────────────────────────────────────────────
  async trending(limit = 12): Promise<TemplateSummary[]> {
    return this.list({ limit, orderBy: "popular" })
  },

  // ── 按创作者获取 ──────────────────────────────────────────────────
  async byCreator(creatorId: string, includeAll = false): Promise<TemplateSummary[]> {
    return this.list({
      creatorId,
      status: includeAll ? undefined : "published",
      orderBy: "newest",
      limit: 50,
    })
  },

  // ── 删除 ──────────────────────────────────────────────────────────
  async delete(id: string) {
    return prisma.template.delete({ where: { id } })
  },

  // ── 执行次数 +1 ───────────────────────────────────────────────────
  async incrementExecutions(id: string) {
    return prisma.template.update({
      where: { id },
      data: { executionsCount: { increment: 1 } },
    })
  },

  // ── 收藏次数 +1 / -1 ─────────────────────────────────────────────
  async incrementFavorites(id: string, delta: 1 | -1) {
    return prisma.template.update({
      where: { id },
      data: { favoritesCount: { increment: delta } },
    })
  },
}
