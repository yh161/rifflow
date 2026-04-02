import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import type { NextAuthOptions } from "next-auth"

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        }
      }
    }),

    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.passwordHash) return null

        const valid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!valid) return null

        return user
      },
    }),
  ],

  session: {
    strategy: "jwt",
  },

  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`
      if (new URL(url).origin === baseUrl) return url
      return baseUrl
    },

    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id
        // New Google user: no passwordHash, created within the last 60s
        const createdAt = (user as any).createdAt as Date | undefined
        const isRecent = createdAt && (Date.now() - new Date(createdAt).getTime()) < 60_000
        if (isRecent && !(user as any).passwordHash) {
          token.needsInvite = true
        }
      }

      // Legacy token fix: old Google OAuth tokens stored the Google sub (numeric) as id
      if (!token.id && token.sub) token.id = token.sub
      if (token.id && /^\d+$/.test(token.id as string) && token.email) {
        const byEmail = await prisma.user.findUnique({ where: { email: token.email as string } })
        if (byEmail) token.id = byEmail.id
      }

      // Client called update({ inviteValidated: true }) after invite code accepted
      if (trigger === "update" && (session as any)?.inviteValidated) {
        token.needsInvite = false
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.needsInvite = (token.needsInvite as boolean) ?? false
      }
      return session
    },
  },

  events: {
    async createUser({ user }) {
      await prisma.wallet.create({
        data: {
          userId: user.id,
          points: 100,
        },
      })
    },
  },

  pages: {
    signIn: "/login",
  },
}
