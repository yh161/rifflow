# Deploy Rifflow to GCP

Deploy the Rifflow app: commit to git and deploy to GCP Cloud Run.

## Key Configuration

| Item | Value |
|------|-------|
| GCP Project | `project-681c7dd7-ea4e-4ca9-96f` |
| Artifact Registry | `asia-northeast1-docker.pkg.dev/project-681c7dd7-ea4e-4ca9-96f/graph-app/rifflow:latest` |
| Cloud Run Service | `rifflow` |
| Region | `asia-northeast1` |
| Service URL | `https://app.rifflow.ai` |
| GCP Raw URL | `https://rifflow-679499639694.asia-northeast1.run.app` |
| Storage (GCS) | `https://storage.googleapis.com/graph-app-storage-681c7dd7` |

## Steps

### 1. Commit & push to git
```bash
git add <files>
git commit -m "..."
git push origin main
```

### 2. Build Docker image (Cloud Build)
```bash
/opt/homebrew/bin/gcloud builds submit --config cloudbuild.yaml
```
Uses `cloudbuild.yaml` in project root — automatically injects `NEXT_PUBLIC_STORAGE_URL` build arg.
Takes ~4 minutes. Wait for `STATUS: SUCCESS`.

### 3. Deploy to Cloud Run
```bash
/opt/homebrew/bin/gcloud run deploy rifflow \
  --image asia-northeast1-docker.pkg.dev/project-681c7dd7-ea4e-4ca9-96f/graph-app/rifflow:latest \
  --region asia-northeast1 \
  --quiet
```

### 4. Verify
```bash
/opt/homebrew/bin/gcloud run services describe rifflow --region=asia-northeast1 \
  --format="value(status.url,status.conditions[0].type)"
```

## One-time: Migrate old storage URLs in production DB

Run this once after deploying to fix existing drafts/templates that stored old domain URLs:

```bash
# Connect via Cloud SQL Auth Proxy first, then:
OLD_STORAGE_BASE="https://rifflow-679499639694.asia-northeast1.run.app/node-images,https://rifflow.ai/node-images" \
DATABASE_URL="postgresql://..." \
npx tsx scripts/migrate-storage-urls.ts --dry-run

# Remove --dry-run when confirmed
```

## Common Issues

**`artifactregistry.repositories.uploadArtifacts` denied**
Cloud Build 用的是 compute 服务账号，需授权：
```bash
gcloud artifacts repositories add-iam-policy-binding graph-app \
  --location=asia-northeast1 \
  --member="serviceAccount:679499639694-compute@developer.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

**Database migration**
`start.sh` 在容器启动时自动执行 `node scripts/migrate.js`（自定义迁移脚本，非 prisma CLI），无需手动操作。每次新增功能如有 schema 变更，需在 `prisma/migrations/` 下手动创建对应 SQL 文件。

**Check DB via Cloud SQL**
GCP 数据库不开放外部 TCP（5432 超时），需通过 Cloud SQL Auth Proxy 或 Cloud Shell 连接。
