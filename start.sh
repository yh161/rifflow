#!/bin/sh
# 启动前执行数据库迁移（幂等操作，安全重复执行）
echo "[start] running DB migrations..."
if ! node scripts/migrate.js; then
  echo "[start] ERROR: DB migrations failed, aborting"
  exit 1
fi
echo "[start] starting Next.js server..."
exec node server.js
