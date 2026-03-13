// Base repository implementation using Prisma

import { PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { IRepository } from "./types"

export abstract class BaseRepository<T, CreateInput, UpdateInput> implements IRepository<T, CreateInput, UpdateInput> {
  protected prisma: PrismaClient
  protected model: keyof PrismaClient

  constructor(model: keyof PrismaClient, client: PrismaClient = prisma) {
    this.prisma = client
    this.model = model
  }

  async findById(id: string): Promise<T | null> {
    return (this.prisma[this.model] as any).findUnique({
      where: { id }
    })
  }

  async findAll(filter?: Partial<T>): Promise<T[]> {
    const where = filter ? this.buildWhereClause(filter) : undefined
    return (this.prisma[this.model] as any).findMany({
      where
    })
  }

  async create(data: CreateInput): Promise<T> {
    return (this.prisma[this.model] as any).create({
      data
    })
  }

  async update(id: string, data: UpdateInput): Promise<T> {
    return (this.prisma[this.model] as any).update({
      where: { id },
      data
    })
  }

  async delete(id: string): Promise<T> {
    return (this.prisma[this.model] as any).delete({
      where: { id }
    })
  }

  protected buildWhereClause(filter: Partial<T>): any {
    const where: any = {}
    
    for (const [key, value] of Object.entries(filter)) {
      if (value !== undefined) {
        if (typeof value === 'string') {
          where[key] = { contains: value, mode: 'insensitive' }
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          where[key] = value
        } else if (value instanceof Date) {
          where[key] = value
        } else if (Array.isArray(value)) {
          where[key] = { in: value }
        }
      }
    }
    
    return where
  }
}