# 产品技术文档 - Graph App

## 项目概述

Graph App 是一个基于 Next.js 和 Prisma 开发的节点编排可视化应用，类似于 ComfyUI。该应用提供了直观的图形界面，让用户能够通过拖拽和连接节点来创建复杂的工作流程，支持多种节点类型（文本、图像、视频、条件判断等），并能够执行这些工作流程。

### 技术栈
- **前端框架**: Next.js 16.1.6 (React 19.2.3)
- **数据库**: PostgreSQL + Prisma ORM
- **UI组件**: shadcn/ui + Tailwind CSS
- **节点画布**: ReactFlow
- **认证**: NextAuth.js
- **对象存储**: MinIO

## 项目结构

### 整体架构

```
graph-app/
├── app/                          # Next.js App Router
│   ├── api/                      # API 路由
│   ├── services/                 # 业务逻辑服务
│   └── layout.tsx                # 根布局
├── components/                   # React 组件
│   ├── layout/                   # 布局组件
│   ├── canvas/                   # 画布组件
│   └── modules/                  # 节点模块
├── lib/                          # 工具库
├── prisma/                       # 数据库模式
└── hooks/                        # 自定义 Hooks
```

### 详细目录结构

#### 1. 应用核心层 (app/)

**API 路由 (app/api/)**
- `auth/[...nextauth]/` - NextAuth 认证路由
- `draft/route.ts` - 草稿 CRUD 操作
- `execute/node/route.ts` - 执行单个节点
- `execute/workflow/route.ts` - 执行工作流
- `jobs/route.ts` - 任务管理
- `user/wallet/route.ts` - 用户钱包

**业务服务 (app/services/)**
- `workflow.service.ts` - 工作流执行引擎
- `job.service.ts` - 任务管理服务
- `draft.service.ts` - 草稿服务
- `module.registry.ts` - 节点模块注册

**数据访问层 (app/repositories/)**
- `base.repository.ts` - 基础仓储抽象
- `job.repository.ts` - Job 数据访问
- `user.repository.ts` - 用户数据访问
- `riffDraft.repository.ts` - 草稿数据访问

#### 2. 组件层 (components/)

**画布系统 (components/layout/canvas/)**
- `canvas.tsx` - 主画布组件，集成了 ReactFlow
- `hooks/useCanvasState.ts` - 画布状态管理
- `hooks/useNodeOperations.ts` - 节点操作逻辑
- `hooks/useLoopManager.ts` - 循环/容器节点管理
- `hooks/useImportExport.ts` - 导入导出功能

**节点模块 (components/layout/modules/)**
- `text.tsx` - 文本节点
- `image.tsx` - 图像处理节点
- `video.tsx` - 视频处理节点
- `gate.tsx` - 条件判断节点
- `batch.tsx` - 批处理容器节点
- `cycle.tsx` - 循环节点
- `seed.tsx` - 种子节点
- `lasso.tsx` - 选择容器节点
- `_registry.tsx` - 节点注册中心
- `_types.ts` - 节点类型定义

**节点编辑器 (components/layout/node_editor/)**
- `node_editor_index.tsx` - 编辑器主入口
- `_panels.tsx` - 属性面板
- `_action_bar.tsx` - 操作栏

#### 3. 工具库 (lib/)

- `auth.ts` - 认证逻辑封装
- `prisma.ts` - Prisma 客户端单例
- `prompt-resolver.ts` - 提示词解析器
- `image-compress.ts` - 图像压缩工具
- `minio.ts` - MinIO 对象存储客户端

#### 4. 数据库层 (prisma/)

**数据模型 (schema.prisma)**
- `User` - 用户表
- `Wallet` - 钱包表
- `Job` - 执行任务表
- `WorkflowJob` - 工作流任务表
- `RiffDraft` - 工作流草稿表
- `ExecutionLog` - 执行日志表

## 核心功能

### 1. 节点系统

#### 节点类型

| 节点类型 | 文件 | 功能 |
|---------|------|------|
| Seed | `seed.tsx` | 输入种子值，作为工作流起点 |
| Text | `text.tsx` | 文本输入/输出，支持提示词 |
| Image | `image.tsx` | 图像生成和处理 |
| Video | `video.tsx` | 视频生成和处理 |
| Gate | `gate.tsx` | 条件判断和分支 |
| Batch | `batch.tsx` | 批处理容器，支持多实例 |
| Cycle | `cycle.tsx` | 循环容器，支持迭代执行 |
| Standard | `standard.tsx` | 标准处理节点 |
| Lasso | `lasso.tsx` | 选择容器节点 |

#### 节点数据结构

```typescript
export interface CustomNodeData {
  type: 'text' | 'image' | 'video' | 'gate' | 'batch' | 'cycle' | 'seed' | 'lasso'
  label?: string
  content?: string
  prompt?: string
  model?: string
  params?: Record<string, string>
  // 容器节点特有属性
  loopCount?: number
  instanceCount?: number
  // 循环实例信息
  loopId?: string
  instanceIdx?: number
  // 编辑状态
  isEditing?: boolean
  isLocked?: boolean
}
```

### 2. 工作流执行引擎

#### DAG 执行算法

工作流引擎基于有向无环图(DAG)执行，核心算法：

1. 构建邻接表和入度映射
2. 找到所有源节点（入度为0）
3. 并行执行源节点
4. 节点完成后，减少邻居节点的入度
5. 新的源节点加入执行队列
6. 重复直到所有节点处理完成

#### 执行流程

```
用户创建工作流 → 保存为草稿 → 执行工作流 → 创建 WorkflowJob
                                                    ↓
                                               分解为多个 Job
                                                    ↓
                                               并行/串行执行
                                                    ↓
                                               收集结果并返回
```

### 3. 数据管理

#### 草稿系统

- 自动保存：使用 `useAutosave` Hook 定期保存工作流状态
- 服务端同步：通过 `/api/draft` 端点与服务器同步
- 本地存储：支持离线编辑和恢复

#### 任务管理

- Job 跟踪：每个节点执行对应一个 Job 记录
- 状态管理：pending → running → done/failed
- 依赖关系：支持节点间的数据依赖

### 4. 用户认证与权限

- NextAuth.js 集成
- 支持多种 OAuth 提供商
- 用户会话管理
- 基于角色的访问控制

## 技术特色

### 1. 组件化设计

- 高度模块化的节点系统
- 可扩展的节点类型注册机制
- 统一的节点接口和交互模式

### 2. 状态管理

- 使用 React Hooks 进行局部状态管理
- 全局状态通过 React Context 传递
- 自定义 Hooks 封装复杂逻辑

### 3. 性能优化

- ReactFlow 虚拟化渲染大量节点
- 并行执行提高工作流效率
- 智能缓存和懒加载

### 4. 开发体验

- TypeScript 全栈类型安全
- ESLint + Prettier 代码规范
- shadcn/ui 组件库
- 热重载开发环境

## 部署与扩展

### 部署要求

- Node.js 18+
- PostgreSQL 数据库
- MinIO 对象存储（可选）
- Redis（用于缓存，可选）

### Docker 支持

项目包含 `docker-compose.yml`，支持一键部署：

```bash
docker-compose up -d
```

### 扩展方向

1. **新节点类型**：在 `components/layout/modules/` 下添加新模块
2. **新 API 端点**：在 `app/api/` 下添加路由
3. **新业务逻辑**：在 `app/services/` 下添加服务
4. **数据表扩展**：修改 `prisma/schema.prisma` 并运行迁移

## 开发指南

### 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local

# 运行开发服务器
npm run dev
```

### 代码规范

- 使用 TypeScript 类型定义
- 遵循 ESLint 规则
- 组件使用函数式组件和 Hooks
- API 路由使用 RESTful 设计

### 测试策略

- 单元测试：Jest + React Testing Library
- 集成测试：Playwright
- API 测试：Supertest

## 维护与监控

### 日志系统

- 执行日志记录到数据库
- 错误追踪和报警
- 性能监控指标

### 备份策略

- 数据库定期备份
- 对象存储版本控制
- 用户数据导出功能

## 总结

Graph App 是一个功能强大、架构清晰的节点编排应用，通过模块化设计和先进的执行引擎，为用户提供了直观且强大的工作流创建和管理能力。项目采用现代化的技术栈和最佳实践，具有良好的可扩展性和维护性。