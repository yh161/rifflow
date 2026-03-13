// RiffDraft repository implementation

import { Prisma } from "@prisma/client"
import { BaseRepository } from "./base.repository"
import { IRiffDraftRepository } from "./types"

export class RiffDraftRepository extends BaseRepository<
  Prisma.RiffDraftGetPayload<object>,
  Prisma.RiffDraftCreateInput,
  Prisma.RiffDraftUpdateInput
> implements IRiffDraftRepository {
  
  constructor() {
    super('riffDraft')
  }

  async findByUserId(userId: string): Promise<Prisma.RiffDraftGetPayload<object> | null> {
    return this.prisma.riffDraft.findUnique({
      where: { userId }
    })
  }

  async upsertByUserId(userId: string, data: Prisma.RiffDraftCreateInput): Promise<Prisma.RiffDraftGetPayload<object>> {
    return this.prisma.riffDraft.upsert({
      where: { userId },
      create: data,
      update: data
    })
  }
}