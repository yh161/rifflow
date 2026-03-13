import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { minioClient, MINIO_BUCKET, MINIO_PUBLIC_URL, ensureBucket } from '@/lib/minio'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'

// ─────────────────────────────────────────────
// POST /api/upload
// Accepts multipart/form-data with a "file" field (image).
// Uploads to MinIO and returns { url } — a persistent, public URL.
// ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await ensureBucket()

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer   = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || 'image/png'
    const ext      = mimeType.split('/')[1]?.split('+')[0] || 'png'
    const fileName = `${randomUUID()}.${ext}`

    // Upload buffer to MinIO
    const stream = Readable.from(buffer)
    await minioClient.putObject(MINIO_BUCKET, fileName, stream, buffer.length, {
      'Content-Type': mimeType,
    })

    const url = `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${fileName}`
    return NextResponse.json({ url })

  } catch (error: unknown) {
    console.error('[upload] error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
