// ExecutionLog repository implementation

import { Prisma } from "@prisma/client"
import { BaseRepository } from "./base.repository"

export interface IExecutionLogRepository {
  create(data: Prisma.ExecutionLogCreateInput): Promise<Prisma.ExecutionLogGetPayload<object>>
  findByUserId(userId: string): Promise<Prisma.ExecutionLogGetPayload<object>[]>
}

export class ExecutionLogRepository extends BaseRepository<
  Prisma.ExecutionLogGetPayload<object>,
  Prisma.ExecutionLogCreateInput,
  Prisma.ExecutionLogUpdateInput
> implements IExecutionLogRepository {
  
  constructor() {
    super('executionLog')
  }

  async findByUserId(userId: string): Promise<Prisma.ExecutionLogGetPayload<object>[]> {
    return this.prisma.executionLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })
  }
}