#!/bin/sh
# 启动前执行数据库迁移（幂等操作，安全重复执行）
echo "[start] running prisma migrate deploy..."
if ! node node_modules/prisma/build/index.js migrate deploy; then
  echo "[start] ERROR: prisma migrate deploy failed, aborting"
  exit 1
fi
echo "[start] starting Next.js server..."
exec node server.js
