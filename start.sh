#!/bin/sh
# 启动前执行数据库迁移（幂等操作，安全重复执行）
echo "[start] running prisma migrate deploy..."
node_modules/.bin/prisma migrate deploy
echo "[start] starting Next.js server..."
exec node server.js
