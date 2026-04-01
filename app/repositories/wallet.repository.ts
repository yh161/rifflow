// Wallet repository implementation

import { Prisma } from "@prisma/client"
import { BaseRepository } from "./base.repository"
import { IWalletRepository } from "./types"

export class WalletRepository extends BaseRepository<
  Prisma.WalletGetPayload<object>,
  Prisma.WalletCreateInput,
  Prisma.WalletUpdateInput
> implements IWalletRepository {
  
  constructor() {
    super('wallet')
  }

  async findByUserId(userId: string): Promise<Prisma.WalletGetPayload<object> | null> {
    return this.prisma.wallet.findUnique({
      where: { userId }
    })
  }

  async updateBalance(userId: string, amount: number): Promise<Prisma.WalletGetPayload<object>> {
    return this.prisma.wallet.update({
      where: { userId },
      data: { points: { increment: amount } }
    })
  }
}