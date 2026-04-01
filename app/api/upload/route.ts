import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadFile, ensureStorage } from '@/lib/storage'
import { randomUUID } from 'crypto'

// ─────────────────────────────────────────────
// POST /api/upload
// Accepts multipart/form-data with a "file" field (image).
// Uploads to storage and returns { url } — a persistent, public URL.
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureStorage()

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer   = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || 'image/png'
    const ext      = mimeType.split('/')[1]?.split('+')[0] || 'png'
    // Use userId/ prefix so per-user GC can list objects with a single prefix scan
    const objectKey = `${session.user.id}/${randomUUID()}.${ext}`

    const url = await uploadFile(objectKey, buffer, mimeType)
    return NextResponse.json({ url })

  } catch (error: unknown) {
    console.error('[upload] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
