import * as Minio from 'minio'

export const minioClient = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'localhost',
  port:      parseInt(process.env.MINIO_PORT || '9000'),
  useSSL:    process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'password123',
})

export const MINIO_BUCKET     = process.env.MINIO_BUCKET     || 'node-images'
export const MINIO_PUBLIC_URL = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000'

// ─────────────────────────────────────────────
// Ensure the bucket exists and is publicly readable
// ─────────────────────────────────────────────
export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(MINIO_BUCKET)
  if (!exists) {
    await minioClient.makeBucket(MINIO_BUCKET)
  }

  // GCS manages public access via IAM (set at bucket creation time),
  // so skip setBucketPolicy in production to avoid S3-compat API errors.
  if (process.env.NODE_ENV !== 'production') {
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect:    'Allow',
          Principal: { AWS: ['*'] },
          Action:    ['s3:GetObject'],
          Resource:  [`arn:aws:s3:::${MINIO_BUCKET}/*`],
        },
      ],
    })
    await minioClient.setBucketPolicy(MINIO_BUCKET, policy)
  }
}
