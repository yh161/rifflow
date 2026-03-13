// Repository interface definitions

import { Prisma } from "@prisma/client"

// Base repository interface
export interface IRepository<T, CreateInput, UpdateInput> {
  findById(id: string): Promise<T | null>
  findAll(filter?: Partial<T>): Promise<T[]>
  create(data: CreateInput): Promise<T>
  update(id: string, data: UpdateInput): Promise<T>
  delete(id: string): Promise<T>
}

// User repository
export interface IUserRepository extends IRepository<
  Prisma.UserGetPayload<{ include: { wallet: true } }>,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput
> {
  findByEmail(email: string): Promise<Prisma.UserGetPayload<{ include: { wallet: true } }> | null>
  findWithWallet(userId: string): Promise<Prisma.UserGetPayload<{ include: { wallet: true } }> | null>
}

// RiffDraft repository
export interface IRiffDraftRepository extends IRepository<
  Prisma.RiffDraftGetPayload<object>,
  Prisma.RiffDraftCreateInput,
  Prisma.RiffDraftUpdateInput
> {
  findByUserId(userId: string): Promise<Prisma.RiffDraftGetPayload<object> | null>
  upsertByUserId(userId: string, data: Prisma.RiffDraftCreateInput): Promise<Prisma.RiffDraftGetPayload<object>>
}

// Wallet repository
export interface IWalletRepository extends IRepository<
  Prisma.WalletGetPayload<object>,
  Prisma.WalletCreateInput,
  Prisma.WalletUpdateInput
> {
  findByUserId(userId: string): Promise<Prisma.WalletGetPayload<object> | null>
  updateBalance(userId: string, amount: number): Promise<Prisma.WalletGetPayload<object>>
}

// Job repository
export interface IJobRepository extends IRepository<
  Prisma.JobGetPayload<object>,
  Prisma.JobCreateInput,
  Prisma.JobUpdateInput
> {
  findByUserId(userId: string, status?: string): Promise<Prisma.JobGetPayload<object>[]>
  updateStatus(jobId: string, status: string, result?: unknown, error?: string): Promise<Prisma.JobGetPayload<object>>
}
