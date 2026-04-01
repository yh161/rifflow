import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      inviteVerified: boolean
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    inviteVerified?: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    inviteVerified?: boolean
  }
}
