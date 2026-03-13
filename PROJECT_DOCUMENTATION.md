# 项目文档

## 项目概述

这是一个基于 Next.js 的节点编辑器应用，支持用户创建、编辑和执行节点工作流。应用提供了可视化的节点编辑界面，支持多种节点类型（文本、图像、视频、循环、批量处理等），并集成了用户认证、钱包系统和任务执行功能。

## 技术栈

### 前端框架
- **Next.js 16.1.6** - React 框架
- **React 19.2.3** - UI 库
- **TypeScript 5** - 类型安全
- **Tailwind CSS 4** - 样式框架

### 核心依赖
- **@xyflow/react 12.10.0** - 节点编辑器核心库
- **reactflow 11.11.4** - 节点编辑器
- **NextAuth 4.24.13** - 身份验证
- **Prisma 7.4.2** - ORM
- **PostgreSQL** - 数据库
- **MinIO** - 对象存储

### UI 组件
- **Radix UI** - 无障碍 UI 组件
- **Lucide React** - 图标库
- **shadcn/ui** - UI 组件库

### 工具库
- **bcryptjs** - 密码加密
- **jszip** - ZIP 文件处理
- **dexie** - IndexedDB 封装
- **idb** - IndexedDB 工具

## 项目结构

```
graph-app/
├── app/                          # Next.js 应用目录
│   ├── api/                      # API 路由
│   │   ├── auth/                 # 认证相关 API
│   │   ├── draft/                # 草稿相关 API
│   │   ├── execute/              # 节点执行 API
│   │   ├── jobs/                 # 任务管理 API
│   │   ├── upload/               # 文件上传 API
│   │   └── user/                 # 用户相关 API
│   ├── middleware/               # 中间件
│   ├── repositories/             # 数据访问层
│   ├── services/                 # 业务逻辑层
│   └── layout.tsx                # 根布局
├── components/                   # React 组件
│   ├── layout/                   # 布局组件
│   │   ├── canvas/               # 画布组件
│   │   ├── node_editor/          # 节点编辑器
│   │   ├── modules/              # 节点模块
│   │   └── browser/              # 浏览器组件
│   └── ui/                       # UI 基础组件
├── prisma/                       # 数据库
│   ├── schema.prisma             # 数据模型定义
│   └── migrations/               # 数据库迁移
├── data/                         # 数据存储
│   ├── minio/                    # MinIO 存储
│   └── postgres/                 # PostgreSQL 数据
├── hooks/                        # 自定义 Hooks
├── lib/                          # 工具库
├── public/                       # 静态资源
└── types/                        # TypeScript 类型定义
```

## 核心功能

### 1. 用户系统
- 用户注册和登录
- 用户资料管理
- 邮箱验证
- 头像上传

### 2. 节点编辑器
- 可视化节点编辑界面
- 节点拖拽和连接
- 多种节点类型：
  - **标准节点** - 基础处理节点
  - **文本节点** - 文本处理
  - **图像节点** - 图像处理
  - **视频节点** - 视频处理
  - **循环节点** - 循环处理
  - **批量节点** - 批量处理
  - **门控节点** - 条件控制
  - **种子节点** - 随机生成
- 节点参数配置
- 节点图片展示

### 3. 草稿管理
- 自动保存草稿
- 草稿版本管理
- 节点和边数据存储

### 4. 任务执行
- 节点执行队列
- 执行状态跟踪
- 执行结果存储
- 错误处理和日志

### 5. 钱包系统
- 余额管理
- 积分系统
- 交易记录
- 消耗统计

### 6. 文件管理
- 文件上传
- MinIO 对象存储
- 节点图片管理

## 数据库模型

### User (用户)
- `id` - 用户唯一标识
- `email` - 邮箱（唯一）
- `passwordHash` - 密码哈希
- `name` - 用户名
- `image` - 头像 URL
- `emailVerified` - 邮箱验证时间
- `preferences` - 用户偏好设置
- `wallet` - 关联钱包
- `riffDraft` - 关联草稿
- `jobs` - 关联任务

### Wallet (钱包)
- `id` - 钱包唯一标识
- `userId` - 用户 ID（唯一）
- `balance` - 余额
- `points` - 积分
- `updatedAt` - 更新时间

### RiffDraft (草稿)
- `id` - 草稿唯一标识
- `userId` - 用户 ID（唯一）
- `nodesJson` - 节点数据
- `edgesJson` - 边数据
- `createdAt` - 创建时间
- `updatedAt` - 更新时间

### Job (任务)
- `id` - 任务唯一标识
- `userId` - 用户 ID
- `nodeId` - 节点 ID
- `nodeType` - 节点类型
- `status` - 状态（pending/running/completed/failed）
- `result` - 执行结果
- `error` - 错误信息
- `createdAt` - 创建时间
- `updatedAt` - 更新时间

### ExecutionLog (执行日志)
- `id` - 日志唯一标识
- `userId` - 用户 ID
- `nodeType` - 节点类型
- `inputTokens` - 输入 token 数
- `outputTokens` - 输出 token 数
- `creditCost` - 消耗积分
- `status` - 状态
- `createdAt` - 创建时间

## API 路由

### 认证相关
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/[...nextauth]` - NextAuth 处理

### 草稿相关
- `GET/POST/PUT /api/draft` - 草稿 CRUD

### 执行相关
- `POST /api/execute/node` - 节点执行

### 任务相关
- `GET/POST /api/jobs` - 任务列表和创建
- `GET /api/jobs/[jobId]` - 任务详情

### 上传相关
- `POST /api/upload` - 文件上传

### 用户相关
- `GET /api/user/wallet` - 钱包信息

## 开发指南

### 环境要求
- Node.js 20+
- PostgreSQL 14+
- Docker（用于本地开发）

### 安装依赖
```bash
npm install
```

### 启动开发服务器
```bash
npm run dev
```

### 数据库迁移
```bash
npx prisma migrate dev
```

### 构建生产版本
```bash
npm run build
```

### 运行生产版本
```bash
npm start
```

### 代码检查
```bash
npm run lint
```

## 部署

### Docker 部署
项目包含 `docker-compose.yml` 配置文件，可使用 Docker Compose 启动完整环境。

### Vercel 部署
推荐使用 Vercel 部署 Next.js 应用。

## 注意事项

1. **安全性**：生产环境需要配置环境变量，包括数据库连接、MinIO 凭证等
2. **性能优化**：注意节点编辑器的性能，大量节点时需要优化渲染
3. **错误处理**：完善错误处理机制，提供友好的错误提示
4. **数据备份**：定期备份数据库和 MinIO 数据
5. **监控**：添加应用监控和日志记录

## 许可证

MIT