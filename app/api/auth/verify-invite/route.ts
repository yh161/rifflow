import { NextRequest, NextResponse } from "next/server"

function getValidInviteCodes(): string[] {
  const envCodes = process.env.INVITE_CODES
  if (!envCodes) return []
  return envCodes.split(",").map(c => c.trim()).filter(Boolean)
}

// Validates invite code only — no DB writes.
// Client calls useSession().update({ inviteValidated: true }) on success.
export async function POST(req: NextRequest) {
  const { inviteCode } = await req.json()
  const validCodes = getValidInviteCodes()

  if (!inviteCode || !validCodes.includes(inviteCode.trim())) {
    return NextResponse.json({ error: "Invalid invite code" }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
