import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// ─────────────────────────────────────────────
// UserFavorite
// ─────────────────────────────────────────────
export const favoriteRepository = {
  async toggle(userId: string, templateId: string): Promise<"added" | "removed"> {
    const existing = await prisma.userFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    })
    if (existing) {
      await prisma.userFavorite.delete({
        where: { userId_templateId: { userId, templateId } },
      })
      await prisma.template.update({
        where: { id: templateId },
        data: { favoritesCount: { decrement: 1 } },
      })
      return "removed"
    } else {
      await prisma.userFavorite.create({ data: { userId, templateId } })
      await prisma.template.update({
        where: { id: templateId },
        data: { favoritesCount: { increment: 1 } },
      })
      return "added"
    }
  },

  async isFavorite(userId: string, templateId: string): Promise<boolean> {
    const row = await prisma.userFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    })
    return !!row
  },

  async listByUser(userId: string) {
    return prisma.userFavorite.findMany({
      where: { userId },
      orderBy: { addedAt: "desc" },
      include: {
        template: {
          select: {
            id: true, name: true, description: true, thumbnail: true,
            category: true, pricingType: true, pricePerUse: true,
            executionsCount: true, rating: true,
            creator: { select: { id: true, name: true, image: true } },
          },
        },
      },
    })
  },

  // 批量检查用户是否收藏了某批模板
  async checkBatch(userId: string, templateIds: string[]): Promise<Set<string>> {
    const rows = await prisma.userFavorite.findMany({
      where: { userId, templateId: { in: templateIds } },
      select: { templateId: true },
    })
    return new Set(rows.map((r) => r.templateId))
  },
}

// ─────────────────────────────────────────────
// SubscriptionPlan
// ─────────────────────────────────────────────
export const subscriptionPlanRepository = {
  async create(data: Prisma.SubscriptionPlanCreateInput) {
    return prisma.subscriptionPlan.create({ data })
  },

  async byCreator(creatorId: string) {
    return prisma.subscriptionPlan.findMany({
      where: { creatorId, isActive: true },
      include: {
        templates: {
          select: { id: true, name: true, thumbnail: true, executionsCount: true },
        },
        _count: { select: { subscribers: true } },
      },
    })
  },

  async findById(id: string) {
    return prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        templates: {
          select: { id: true, name: true, thumbnail: true },
        },
        creator: { select: { id: true, name: true, image: true } },
      },
    })
  },
}

// ─────────────────────────────────────────────
// UserSubscription
// ─────────────────────────────────────────────
export const userSubscriptionRepository = {
  async subscribe(userId: string, planId: string, creatorId: string, months = 1) {
    const endsAt = new Date()
    endsAt.setMonth(endsAt.getMonth() + months)
    return prisma.userSubscription.upsert({
      where: { userId_planId: { userId, planId } },
      update: { status: "active", endsAt, autoRenew: true },
      create: { userId, planId, creatorId, endsAt },
    })
  },

  async cancel(userId: string, planId: string) {
    return prisma.userSubscription.update({
      where: { userId_planId: { userId, planId } },
      data: { status: "cancelled", autoRenew: false },
    })
  },

  async listByUser(userId: string) {
    return prisma.userSubscription.findMany({
      where: { userId, status: "active" },
      include: {
        plan: {
          include: {
            creator: { select: { id: true, name: true, image: true } },
            templates: {
              select: { id: true, name: true, thumbnail: true },
            },
          },
        },
      },
    })
  },

  // 检查用户是否已订阅某创作者的某个套餐
  async isSubscribed(userId: string, creatorId: string): Promise<boolean> {
    const row = await prisma.userSubscription.findFirst({
      where: { userId, creatorId, status: "active", endsAt: { gt: new Date() } },
    })
    return !!row
  },
}

// ─────────────────────────────────────────────
// TemplateExecution
// ─────────────────────────────────────────────
export const executionRepository = {
  async create(data: {
    userId: string
    templateId: string
    creatorId: string
    inputParams: Record<string, unknown>
    cost?: number
  }) {
    return prisma.templateExecution.create({
      data: {
        ...data,
        inputParams: data.inputParams as Prisma.InputJsonValue,
        cost: data.cost ?? 0,
      },
    })
  },

  async updateResult(id: string, resultUrl: string, resultType: string) {
    return prisma.templateExecution.update({
      where: { id },
      data: { status: "completed", resultUrl, resultType, completedAt: new Date() },
    })
  },

  async fail(id: string) {
    return prisma.templateExecution.update({
      where: { id },
      data: { status: "failed", completedAt: new Date() },
    })
  },

  async listByUser(userId: string, limit = 20) {
    return prisma.templateExecution.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: limit,
      include: {
        template: { select: { id: true, name: true, thumbnail: true } },
      },
    })
  },
}

// ─────────────────────────────────────────────
// UserAsset
// ─────────────────────────────────────────────
export const userAssetRepository = {
  async create(data: {
    userId: string
    name: string
    type: string
    url: string
    size?: number
    sourceExecutionId?: string
    sourceTemplateId?: string
  }) {
    return prisma.userAsset.create({ data })
  },

  async listByUser(userId: string, onlyStarred = false) {
    return prisma.userAsset.findMany({
      where: { userId, ...(onlyStarred && { starred: true }) },
      orderBy: { createdAt: "desc" },
    })
  },

  async toggleStar(id: string, userId: string) {
    const asset = await prisma.userAsset.findFirst({ where: { id, userId } })
    if (!asset) return null
    return prisma.userAsset.update({
      where: { id },
      data: { starred: !asset.starred },
    })
  },

  async delete(id: string, userId: string) {
    return prisma.userAsset.deleteMany({ where: { id, userId } })
  },
}
