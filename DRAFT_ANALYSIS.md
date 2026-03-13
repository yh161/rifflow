# Canvas Draft 数据流分析报告

## 🔄 数据流程图

```
用户操作 Canvas
    ↓
nodes/edges 状态更新
    ↓
useAutosave hook (500ms 防抖)
    ↓
POST /api/draft
    ↓
getServerSession 验证
    ↓ (如果有 session)
DraftService.saveDraft
    ↓
RiffDraftRepository.upsertByUserId
    ↓
PostgreSQL (RiffDraft 表)
```

```
页面刷新
    ↓
Canvas useEffect 触发
    ↓
GET /api/draft
    ↓
getServerSession 验证
    ↓ (如果有 session)
DraftService.getDraftByUserId
    ↓
返回 nodesJson/edgesJson
    ↓
setNodes/setEdges 恢复状态
```

## ❌ 问题根源

### 1. **未验证 API 响应状态码**

**位置**: `components/layout/canvas/canvas.tsx` (第 147-162 行)

```typescript
useEffect(() => {
  fetch("/api/draft")
    .then((r) => r.json())  // ❌ 没有检查 r.ok 或 r.status
    .then((data) => {
      const savedNodes = data.nodesJson
      const savedEdges = data.edgesJson
      if (Array.isArray(savedNodes) && savedNodes.length > 0) {
        setNodes(savedNodes)
      }
      if (Array.isArray(savedEdges) && savedEdges.length > 0) {
        setEdges(savedEdges)
      }
    })
    .catch((err) => console.error("[draft] load failed:", err))
    .finally(() => setIsDraftLoaded(true))  // ❌ 即使失败也会启用自动保存
}, [])
```

**问题**：
- 当用户未登录时，API 返回 `401 Unauthorized`
- 响应体是 `{error: "Unauthorized"}`，没有 `nodesJson` 和 `edgesJson`
- 但代码仍然执行 `setIsDraftLoaded(true)`，启用了自动保存
- 后续的自动保存请求都会失败（401），但用户看不到任何提示

### 2. **登录后不会重新加载草稿**

**位置**: `app/page.tsx`

```typescript
<LoginModal open={isLoginOpen} onOpenChange={setIsLoginOpen} />
```

**问题**：
- LoginModal 关闭后，Canvas 不会重新调用 `fetch("/api/draft")`
- 用户登录成功，但画布仍然是空的
- 需要手动刷新页面才能加载草稿

### 3. **自动保存在未登录时静默失败**

**位置**: `hooks/useAutosave.ts`

```typescript
const res = await fetch("/api/draft", {
  method:  "POST",
  headers: { "Content-Type": "application/json" },
  body:    JSON.stringify({
    nodes: sanitizeNodes(nodes),
    edges,
  }),
})
if (!res.ok) {
  console.warn("[autosave] server returned", res.status)  // ❌ 只有 console 警告
}
```

**问题**：
- 401 错误只在控制台输出，用户不知道数据没有保存
- 用户以为数据已保存，刷新后才发现丢失

## ✅ 修复方案

### 方案 1: 使用 NextAuth Session（推荐）

#### 步骤 1: Canvas 组件监听登录状态

```typescript
// components/layout/canvas/canvas.tsx
import { useSession } from "next-auth/react"

function CanvasLogic({...props}) {
  const { data: session, status } = useSession()
  
  // 加载草稿 - 依赖 session 状态
  useEffect(() => {
    if (status === "loading") return  // 等待 session 加载完成
    if (status === "unauthenticated") {
      setIsDraftLoaded(false)  // 未登录，禁用自动保存
      return
    }
    
    // status === "authenticated" - 加载草稿
    fetch("/api/draft")
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 401) {
            console.warn("[draft] 未登录，无法加载草稿")
            return { nodesJson: [], edgesJson: [] }
          }
          throw new Error(`HTTP ${r.status}`)
        }
        return r.json()
      })
      .then((data) => {
        const savedNodes = data.nodesJson
        const savedEdges = data.edgesJson
        if (Array.isArray(savedNodes) && savedNodes.length > 0) {
          setNodes(savedNodes)
        }
        if (Array.isArray(savedEdges) && savedEdges.length > 0) {
          setEdges(savedEdges)
        }
      })
      .catch((err) => console.error("[draft] load failed:", err))
      .finally(() => setIsDraftLoaded(true))
  }, [status])  // 依赖 session 状态
  
  // 传递登录状态给 useAutosave
  useAutosave(nodes, edges, isDraftLoaded && status === "authenticated")
}
```

#### 步骤 2: 改进自动保存错误处理

```typescript
// hooks/useAutosave.ts
export function useAutosave(
  nodes: Node[],
  edges: Edge[],
  enabled: boolean,
  onAuthError?: () => void  // 新增：认证错误回调
) {
  useEffect(() => {
    if (!enabled) return

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/draft", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            nodes: sanitizeNodes(nodes),
            edges,
          }),
        })
        
        if (!res.ok) {
          if (res.status === 401) {
            console.warn("[autosave] 未登录，无法保存")
            onAuthError?.()  // 通知父组件
            return
          }
          console.warn("[autosave] server returned", res.status)
        }
      } catch (err) {
        console.error("[autosave] failed:", err)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [nodes, edges, enabled, onAuthError])
}
```

### 方案 2: 本地存储降级（备选方案）

如果不希望强制登录，可以在未登录时使用 localStorage：

```typescript
// 保存到 localStorage
const saveToLocal = (nodes: Node[], edges: Edge[]) => {
  try {
    localStorage.setItem('canvas-draft', JSON.stringify({ nodes, edges }))
  } catch (err) {
    console.error('[draft] localStorage save failed:', err)
  }
}

// 从 localStorage 加载
const loadFromLocal = () => {
  try {
    const data = localStorage.getItem('canvas-draft')
    return data ? JSON.parse(data) : null
  } catch (err) {
    console.error('[draft] localStorage load failed:', err)
    return null
  }
}

// 在 Canvas 组件中使用
useEffect(() => {
  if (status === "authenticated") {
    // 从服务器加载
    fetch("/api/draft").then(...)
  } else {
    // 从本地加载
    const localDraft = loadFromLocal()
    if (localDraft?.nodes) setNodes(localDraft.nodes)
    if (localDraft?.edges) setEdges(localDraft.edges)
    setIsDraftLoaded(true)
  }
}, [status])
```

## 🎯 建议的实施步骤

1. ✅ **立即修复**: 添加响应状态码检查，避免 401 时启用自动保存
2. ✅ **短期改进**: 在 Canvas 中使用 useSession 监听登录状态
3. ✅ **中期优化**: 添加用户友好的错误提示（Toast/Notification）
4. 🔄 **长期考虑**: 实现 localStorage 降级，支持未登录用户使用

## 📊 影响范围

- ✅ 已修复：无需更改数据库 schema
- ✅ 已修复：API 路由逻辑正常，无需修改
- ⚠️ 需修改：Canvas 组件加载逻辑
- ⚠️ 需修改：useAutosave hook 错误处理
- 💡 可选：添加用户提示组件
