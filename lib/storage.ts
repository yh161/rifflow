/**
 * lib/storage.ts
 * 统一存储接口：本地用 MinIO，生产用 Google Cloud Storage
 * 调用方只需 import { uploadFile, listFiles, deleteFile, ensureStorage, STORAGE_PUBLIC_BASE }
 */

import { Readable } from 'stream'

const IS_PROD = process.env.NODE_ENV === 'production'

// ─── 环境变量 ────────────────────────────────────────────
const MINIO_ENDPOINT   = process.env.MINIO_ENDPOINT   || 'localhost'
const MINIO_PORT       = parseInt(process.env.MINIO_PORT || '9000')
const MINIO_USE_SSL    = process.env.MINIO_USE_SSL === 'true'
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || 'admin'
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || 'password123'
const MINIO_BUCKET_NAME = process.env.MINIO_BUCKET    || 'node-images'
const MINIO_PUBLIC_URL  = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000'

const GCS_BUCKET_NAME = process.env.GCS_BUCKET || 'graph-app-storage-681c7dd7'

// ─── Public base URL（供调用方拼接完整 URL） ─────────────
export const STORAGE_BUCKET = IS_PROD ? GCS_BUCKET_NAME : MINIO_BUCKET_NAME
export const STORAGE_PUBLIC_BASE = IS_PROD
  ? `https://storage.googleapis.com/${GCS_BUCKET_NAME}`
  : `${MINIO_PUBLIC_URL}/${MINIO_BUCKET_NAME}`

/** Resolve an object key to its full public URL (server-side). */
export function getFileUrl(key: string): string {
  return `${STORAGE_PUBLIC_BASE}/${key}`
}

// ─── 懒加载客户端（避免在不需要的环境中初始化） ──────────

let _minio: import('minio').Client | null = null
function getMinioClient() {
  if (!_minio) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Minio = require('minio') as typeof import('minio')
    _minio = new Minio.Client({
      endPoint:  MINIO_ENDPOINT,
      port:      MINIO_PORT,
      useSSL:    MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    })
  }
  return _minio
}

let _gcs: import('@google-cloud/storage').Storage | null = null
function getGcsStorage() {
  if (!_gcs) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Storage } = require('@google-cloud/storage') as typeof import('@google-cloud/storage')
    _gcs = new Storage()   // Cloud Run 自动使用 Workload Identity，无需密钥
  }
  return _gcs
}

// ─── 确保 bucket 存在（仅开发环境需要） ──────────────────
export async function ensureStorage(): Promise<void> {
  if (IS_PROD) return   // GCS bucket 已在部署时创建

  const minio = getMinioClient()
  const exists = await minio.bucketExists(MINIO_BUCKET_NAME)
  if (!exists) {
    await minio.makeBucket(MINIO_BUCKET_NAME)
  }
  const policy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [{
      Effect:    'Allow',
      Principal: { AWS: ['*'] },
      Action:    ['s3:GetObject'],
      Resource:  [`arn:aws:s3:::${MINIO_BUCKET_NAME}/*`],
    }],
  })
  await minio.setBucketPolicy(MINIO_BUCKET_NAME, policy)
}

// ─── 上传文件，返回公开可访问的 URL ───────────────────────
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<string> {
  if (IS_PROD) {
    const bucket = getGcsStorage().bucket(GCS_BUCKET_NAME)
    await bucket.file(key).save(buffer, {
      metadata:  { contentType },
      resumable: false,
    })
    return `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${key}`
  } else {
    const minio  = getMinioClient()
    const stream = Readable.from(buffer)
    await minio.putObject(MINIO_BUCKET_NAME, key, stream, buffer.length, {
      'Content-Type': contentType,
    })
    return `${MINIO_PUBLIC_URL}/${MINIO_BUCKET_NAME}/${key}`
  }
}

// ─── 列出指定 prefix 下的所有 key ─────────────────────────
export async function listFiles(prefix: string): Promise<string[]> {
  if (IS_PROD) {
    const [files] = await getGcsStorage().bucket(GCS_BUCKET_NAME).getFiles({ prefix })
    return files.map(f => f.name)
  } else {
    return new Promise<string[]>((resolve, reject) => {
      const keys: string[] = []
      const stream = getMinioClient().listObjects(MINIO_BUCKET_NAME, prefix, true)
      stream.on('data', (obj) => { if (obj.name) keys.push(obj.name) })
      stream.on('end',  () => resolve(keys))
      stream.on('error', reject)
    })
  }
}

// ─── 删除单个文件 ─────────────────────────────────────────
export async function deleteFile(key: string): Promise<void> {
  if (IS_PROD) {
    await getGcsStorage().bucket(GCS_BUCKET_NAME).file(key).delete({ ignoreNotFound: true })
  } else {
    await getMinioClient().removeObject(MINIO_BUCKET_NAME, key)
  }
}
