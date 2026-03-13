// User repository implementation

import { Prisma } from "@prisma/client"
import { BaseRepository } from "./base.repository"
import { IUserRepository } from "./types"

export class UserRepository extends BaseRepository<
  Prisma.UserGetPayload<{ include: { wallet: true } }>,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput
> implements IUserRepository {
  
  constructor() {
    super('user')
  }

  async findByEmail(email: string): Promise<Prisma.UserGetPayload<{ include: { wallet: true } }> | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { wallet: true }
    })
  }

  async findWithWallet(userId: string): Promise<Prisma.UserGetPayload<{ include: { wallet: true } }> | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true }
    })
  }
}