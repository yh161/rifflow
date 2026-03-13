// Job repository implementation

import { Prisma } from "@prisma/client"
import { BaseRepository } from "./base.repository"
import { IJobRepository } from "./types"

export class JobRepository extends BaseRepository<
  Prisma.JobGetPayload<object>,
  Prisma.JobCreateInput,
  Prisma.JobUpdateInput
> implements IJobRepository {
  
  constructor() {
    super('job')
  }

  async findByUserId(userId: string, status?: string): Promise<Prisma.JobGetPayload<object>[]> {
    const where: any = { userId }
    if (status) {
      where.status = status
    }
    
    return this.prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    })
  }

  async updateStatus(jobId: string, status: string, result?: unknown, error?: string): Promise<Prisma.JobGetPayload<object>> {
    const updateData: any = { 
      status,
      updatedAt: new Date()
    }
    
    if (result !== undefined) {
      updateData.result = result
    }
    
    if (error !== undefined) {
      updateData.error = error
    }
    
    return this.prisma.job.update({
      where: { id: jobId },
      data: updateData
    })
  }
}