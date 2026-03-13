# Graph App 项目核心结构清单

## 项目概览
这是一个基于 Next.js + Prisma 的节点编排可视化应用（类似 ComfyUI），包含工作流编辑、执行引擎、用户认证、钱包等功能。

---

## 📁 完整目录结构

```
graph-app/
├── 📄 项目配置文件
│   ├── package.json              # 依赖与脚本配置
│   ├── package-lock.json         # 依赖版本锁定
│   ├── tsconfig.json             # TypeScript 编译器配置
│   ├── next.config.ts            # Next.js 构建配置
│   ├── eslint.config.mjs         # ESLint 代码规范
│   ├── postcss.config.mjs        # PostCSS 配置
│   ├── components.json           # shadcn/ui 组件配置
│   ├── prisma.config.ts          # Prisma 客户端配置
│   ├── docker-compose.yml        # Docker 服务编排
│   └── .gitignore                # Git 忽略规则
│
├── 🗄️ 数据库层 (Prisma ORM)
│   └── prisma/
│       ├── schema.prisma                     # 数据库模式定义表结构
│       └── migrations/
│           ├── migration_lock.toml           # 迁移版本号锁定
│           ├── 20260303130008_init/          # 初始迁移 - 用户表等
│           ├── 20260311135845_init_auth/     # 认证迁移 - 添加 OAuth
│           └── 20260312093105_add_riff_draft/ # 草稿迁移
│
├── 🛠️ 工具库层 (Libs)
│   └── lib/
│       ├── auth.ts      # 认证逻辑封装
│       ├── prisma.ts    # Prisma 客户端单例
│       └── utils.ts     # 通用工具函数
│
├── 🎯 服务层 (Services - 业务逻辑)
│   └── app/services/
│       ├── constants.ts             # 常量配置
│       ├── draft.service.ts         # 草稿服务 - 工作流草稿 CRUD
│       ├── job.service.ts           # Job 服务 - 执行任务管理
│       └── module.registry.ts       # 模块注册表 - 节点类型注册
│
├── 💾 仓储层 (Repositories - 数据访问)
│   └── app/repositories/
│       ├── base.repository.ts                   # 基础仓储抽象
│       ├── executionLog.repository.ts           # 执行日志仓储
│       ├── job.repository.ts                    # Job 仓储
│       ├── riffDraft.repository.ts              # Riff 草稿仓储
│       ├── types.ts                             # 仓储类型定义
│       ├── user.repository.ts                   # 用户仓储
│       └── wallet.repository.ts                 # 钱包仓储
│
├── ⚡ API 路由层 (API Routes)
│   └── app/api/
│       ├── auth/[...nextauth]/              # NextAuth 认证路由
│       ├── auth/register/route.ts           # 用户注册
│       ├── draft/route.ts                   # 草稿 CRUD
│       ├── execute/node/route.ts            # 执行单个节点
│       ├── jobs/route.ts                    # Job 列表
│       ├── jobs/[jobId]/route.ts            # 单 Job 详情
│       └── user/wallet/route.ts             # 用户钱包
│
├── 🎨 应用核心层 (App Core)
│   └── app/
│       ├── layout.tsx           # 根布局 - 全局 Provider
│       ├── page.tsx             # 首页路由
│       ├── providers.tsx        # 上下文提供者
│       ├── globals.css          # 全局样式
│       ├── favicon.ico          # Favicon
│       └── middleware/
│           └── error-handler.ts # 错误处理中间件
│
├── 🧩 组件层 (Core Components - 业务组件)
│   └── components/
│       ├── layout/                                   # 布局组件
│       │   ├── login-modal.tsx                 # 登录弹窗
│       │   ├── node_picker.tsx                 # 节点选择器
│       │   ├── run-console.tsx                 # 运行控制台
│       │   ├── sidebar.tsx                     # 侧边栏导航
│       │   ├── std_node_modal.tsx              # 标准节点弹窗
│       │   ├── toolbar.tsx                     # 顶部工具栏
│       │   └── user-avatar.tsx                 # 用户头像
│       │
│       ├── layout/browser/                       # 浏览器容器
│       │   ├── browser.tsx                       # 浏览器主组件
│       │   ├── browser_p1.tsx                    # 浏览器面板 1
│       │   ├── browser_p2.tsx                    # 浏览器面板 2
│       │   └── browser_p3.tsx                    # 浏览器面板 3
│       │
│       ├── layout/canvas/                        # 节点画布
│       │   ├── canvas.tsx                    # 画布主组件
│       │   ├── canvas-toolbar.tsx            # 画布工具栏
│       │   ├── components/
│       │   │   ├── CanvasToolbar.tsx         # Canvas 工具栏组件
│       │   │   ├── GhostCursor.tsx           # 幽灵光标特效
│       │   │   └── QuickAddMenu.tsx          # 快速添加菜单
│       │   └── hooks/
│       │       ├── useCanvasState.ts         # Canvas 状态管理
│       │       ├── useImportExport.ts        # 导入导出功能
│       │       ├── useLoopManager.ts         # 循环/动画管理
│       │       └── useNodeOperations.ts      # 节点操作逻辑
│       │
│       ├── layout/modules/                     # 节点类型模块
│       │   ├── _handle.tsx                   # 节点连接手柄
│       │   ├── _registry.tsx                 # 模块注册中心
│       │   ├── _types.ts                     # 节点类型定义
│       │   ├── gate.tsx                      # 门/条件节点
│       │   ├── image.tsx                     # 图像节点
│       │   ├── loop.tsx                      # 循环节点
│       │   ├── seed.tsx                      # 种子/输入节点
│       │   ├── standard.tsx                  # 标准处理节点
│       │   ├── text.tsx                      # 文本节点
│       │   └── video.tsx                     # 视频节点
│       │
│       └── layout/node_editor/                 # 节点属性编辑器
│           ├── _action_bar.tsx             # 顶部操作栏
│           ├── _overlay.tsx                # 遮罩覆盖层
│           ├── _panels.tsx                 # 属性面板
│           └── node_editor_index.tsx       # 编辑器主入口
│
├── 🪝 Hooks 层
│   └── hooks/
│       └── useAutosave.ts    # 自动保存 Hook
│
├── 📝 类型定义 (Types)
│   └── types/
│       └── next-auth.d.ts      # NextAuth 类型扩展
│
├── 📦 公共资源 (Public)
│   └── public/
│       ├── file.svg
│       ├── globe.svg
│       ├── next.svg
│       ├── vercel.svg
│       ├── window.svg
│       └── favicon.ico
│
├── 🗄️ 本地数据存储 (Data - Dev 环境)
│   └── data/
│       ├── minio/                    # MinIO 对象存储
│       └── postgres/                 # PostgreSQL 本地实例数据
│
└── 🧱 UI 组件库 (ui - shadcn/ui 组件，可忽略)
    └── components/ui/           # 基础 UI 组件，按需忽略
        ├── aspect-ratio.tsx
        ├── avatar.tsx
        ├── badge.tsx
        ├── button.tsx
        ├── context-menu.tsx
        ├── dialog.tsx
        ├── dropdown-menu.tsx
        ├── input.tsx
        ├── label.tsx
        ├── menubar.tsx
        ├── popover.tsx
        ├── scroll-area.tsx
        ├── select.tsx
        ├── separator.tsx
        ├── sheet.tsx
        ├── slider.tsx
        ├── tabs.tsx
        ├── textarea.tsx
        └── tooltip.tsx
```

---

## 🗃️ 数据库表结构 (来自 schema.prisma)

```prisma
// User - 用户表
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  refreshTokens RefreshToken[]
  jobs          Job[]
  drafts        RiffDraft[]
  wallet        Wallet?
}

// Wallet - 钱包表
model Wallet {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  balance   Int      @default(0)
  createdAt DateTime @default(now())  
  updatedAt DateTime @updatedAt
}

// Job - 执行任务表
model Job {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  status      String    @default("pending")
  inputParams String?   // JSON
  result      String?   // JSON
  error       String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

// RiffDraft - 工作流草稿表
model RiffDraft {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  name        String
  workflow    String    // JSON 工作流数据
  thumbnail   String?
  isPublished Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

---

## 🔌 当前节点模块清单

| 模块文件 | 节点类型 | 功能描述 |
|---------|---------|---------|
| `seed.tsx` | Seed | 输入种子值 |
| `text.tsx` | Text | 文本输入/输出 |
| `standard.tsx` | Standard | 标准处理节点 |
| `gate.tsx` | Gate | 条件分支节点 |
| `loop.tsx` | Loop | 循环节点 |
| `image.tsx` | Image | 图像处理节点 |
| `video.tsx` | Video | 视频处理节点 |

---

## 🔄 核心业务流程

1. **用户注册/登录** → `app/api/auth/register` / NextAuth
2. **创建草稿** → `app/services/draft.service.ts` → `RiffDraft` 表
3. **保存工作流** → 节点配置 → Canvas → JSON → Draft
4. **执行 Job** → `app/services/job.service.ts` → `Job` 表 → `execute/node` 引擎
5. **查看结果** → `app/api/jobs/[jobId]` → 返回结果

---

## 🧭 节点架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                         Canvas画布                           │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  Seed    │───→│ Text     │───→│ Standard │───→...       │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                                              │      │
│       └──────────────────────────────────────────────┘     │
│                                                             │
│  所有节点继承自：module.registry.ts 注册的 Node 基类        │
└─────────────────────────────────────────────────────────────┘
```

节点核心接口：
- `module/_types.ts` - 节点类型定义
- `module/_registry.tsx` - 节点注册中心
- `module/_handle.tsx` - 节点连接点 (input/output handles)

---

## 📦 主要依赖

- **Next.js 14** - React 框架
- **Prisma** - ORM 数据库
- **NextAuth.js** - 用户认证
- **shadcn/ui** - UI 组件库
- **Tailwind CSS** - 样式系统
- **Zustand** (如果有) - 状态管理
- **reactflow** 或自定义 - 节点画布

---

## 🚀 可添加功能方向

1. **新的节点类型** → 新增 `components/layout/modules/XXX.tsx`
2. **新的 API 端点** → 新增 `app/api/xxx/route.ts`
3. **新的业务逻辑** → 新增 `app/services/xxx.service.ts`
4. **新的数据表** → 修改 `schema.prisma` + 运行迁移
5. **新的 UI 功能** → 在 `components/layout/` 下新增