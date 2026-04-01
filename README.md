# Rifflow

**Compose your life.** A visual node-based AI workflow builder with a creator marketplace.

Rifflow lets you construct multi-step AI pipelines on a drag-and-drop canvas — chain text generation, image processing, video operations, and more — then publish your workflows as templates for others to discover and run.

---

## Features

- **Visual Canvas Editor** — drag, drop, and connect nodes to build workflows; full undo/redo, keyboard shortcuts, and context menus
- **Multi-Modal AI Nodes** — text, image, video, filter, PDF, seed, and template nodes backed by OpenRouter and Replicate
- **Workflow Execution** — dependency-resolved multi-node orchestration with live status polling
- **Draft Persistence** — auto-save to PostgreSQL with snapshot history; IndexedDB fallback for offline use
- **Community Marketplace** — publish workflows as templates with configurable pricing (free / pay-per-use / subscription)
- **Points & Wallet** — built-in credit system for template monetization
- **Social** — follow creators, send direct messages, favorite templates

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Canvas | ReactFlow 11 |
| Styling | Tailwind CSS 4 + shadcn/ui + Radix UI |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js (email + OAuth) |
| File Storage | MinIO (local) / Google Cloud Storage (prod) |
| AI — Text | OpenRouter API |
| AI — Image/Video | Replicate API |
| Rich Text | TipTap (Markdown + KaTeX math) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL + MinIO)
- API keys: OpenRouter, Replicate (optional for AI nodes)

### 1. Clone & install

```bash
git clone <repo-url>
cd graph-app
npm install
```

### 2. Environment variables

Create `.env.local`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/rifflow"

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret"

# Storage (MinIO local)
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="node-images"

# AI APIs
OPENROUTER_API_KEY="sk-or-..."
REPLICATE_API_TOKEN="r8_..."
```

### 3. Start services

```bash
# Start PostgreSQL + MinIO via Docker
docker compose up -d

# Run database migrations
npx prisma migrate dev

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
app/
├── api/              # API routes (auth, draft, execute, jobs, community, user)
├── services/         # Business logic (draft, job, workflow orchestration)
├── repositories/     # Prisma data access layer
└── page.tsx          # Main editor entry point

components/layout/
├── canvas/           # ReactFlow canvas, hooks, context menus, publish modal
├── modules/          # Node type implementations (text, image, video, filter, pdf, …)
├── browser/          # Right sidebar: drafts, history, templates, community library
├── node_editor/      # Node parameter editor panel
├── sidebar.tsx       # Left sidebar: quick-add, favorites
└── toolbar.tsx       # Run / pause / stop controls

lib/                  # Auth, storage, model definitions, prompt resolver, credits
prisma/               # Schema + migrations
hooks/                # useAutosave, useUpstreamData
```

---

## Architecture

- **Module Registry** — each node type exports a `ModuleConfig`; the registry (`_registry.tsx`) maps type IDs to components and handlers, keeping node implementations self-contained
- **Service Layer** — `draft.service.ts`, `job.service.ts`, and `workflow.service.ts` handle state management, single-node execution, and multi-node dependency resolution respectively
- **Repository Pattern** — typed Prisma wrappers under `app/repositories/` decouple data access from business logic
- **Event-Driven Canvas** — custom DOM events (`canvas:new`, `canvas:load`, `template:saved`) keep the sidebar and canvas loosely coupled

---

## License

MIT
