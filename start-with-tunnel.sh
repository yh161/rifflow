#!/bin/bash

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Start Graph App + Cloudflare Tunnel ===${NC}"

# Kill existing cloudflared tunnel
echo -e "${YELLOW}[1/4] Clean up existing tunnel...${NC}"
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# Kill existing Next.js process
echo -e "${YELLOW}[2/4] Clean up existing Next.js process...${NC}"
pkill -f "next dev" 2>/dev/null || true
sleep 1

# Load environment variables
echo -e "${YELLOW}[3/4] Load environment variables...${NC}"
export $(grep -v '^#' .env | xargs) 2>/dev/null || true

# Store original invite codes for display (keep comma-separated)
INVITE_CODES_DISPLAY="$INVITE_CODES"

# Start Next.js dev server (background)
echo -e "${YELLOW}[4/4] Start server...${NC}"
npm run dev &
NEXT_PID=$!
sleep 3

# Detect actual port
echo -e "${BLUE}Detect service port...${NC}"
for port in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009; do
  if lsof -i :$port | grep -q "node"; then
    ACTUAL_PORT=$port
    echo -e "${GREEN}✓ 服务运行在端口: $port${NC}"
    break
  fi
done

if [ -z "$ACTUAL_PORT" ]; then
  echo -e "${YELLOW}Cannot detect port, use default 3000${NC}"
  ACTUAL_PORT=3000
fi

# 清空屏幕并打印大标题
clear
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                   🚀 Graph App Started!                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Local: http://localhost:$ACTUAL_PORT"
echo ""
echo "📝 Initialize Cloudflare Tunnel..."
echo ""

# 启动 Cloudflare Tunnel，捕获输出
cloudflared tunnel --url http://localhost:$ACTUAL_PORT 2>&1 | while read -r line; do
  # 提取临时链接
  if echo "$line" | grep -q "trycloudflare.com"; then
    URL=$(echo "$line" | grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
    if [ ! -z "$URL" ]; then
      clear
      echo ""
      echo "╔════════════════════════════════════════════════════════════════╗"
      echo "║                   🎉 System Ready!                             ║"
      echo "╚════════════════════════════════════════════════════════════════╝"
      echo ""
      echo -e "📍 ${GREEN}$URL${NC}"
      echo ""
      echo "🔑 Share this link with your friend:"
      echo -e "   ${BLUE}$URL${NC}"
      echo ""
      echo "🔐 Available Invite Codes:"
      echo "$INVITE_CODES_DISPLAY" | tr ',' '\n' | while read code; do
        code=$(echo "$code" | xargs)  # trim whitespace
        if [ ! -z "$code" ]; then
          echo -e "   ${GREEN}$code${NC}"
        fi
      done
      echo ""
      echo "💡 Tips:"
      echo "   1. Share the link and one invite code with your friend"
      echo "   2. Friend clicks 'Continue with Email' and enters the invite code"
      echo "   3. Google login won't work due to OAuth redirect restrictions"
      echo "   4. Press Ctrl+C to stop the server"
      echo ""
      echo "═══════════════════════════════════════════════════════════════════"
      # Copy URL to clipboard
      echo "$URL" | pbcopy 2>/dev/null || true
      echo -e "✅ Link copied to clipboard, send it to your friend!"
    fi
  fi
done