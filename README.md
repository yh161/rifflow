# Rifflow

**AI workflows you can actually see — and actually control.**

**可视化、可控的 AI 工作流平台。**

<p align="center">
  <img src="docs/screenshots/canvas-overview.png" alt="Rifflow Canvas" width="100%" />
</p>

---

## Why Rifflow?

You've probably used ChatGPT, Claude, or similar tools. They're powerful, but they're a black box — you throw something in, hope something useful comes out, and have no idea what happened in between. For casual use, that's fine. For serious work — research, content production, client deliverables — it's not.

你可能用过 ChatGPT、Claude 或者 Coze。它们很强大，但本质是个黑盒 —— 你扔进去一个问题，等着结果出来，中间发生了什么你完全不知道。日常聊天没问题，但如果是科研、内容生产、客户交付这类严肃场景，这种方式根本撑不住。

Existing workflow platforms (n8n, Coze, Dify) solve part of the problem — they let you chain steps together. But their nodes are *operations*: cold API calls, data transforms, logic gates. You can't *see* what's being processed. Rifflow is different: every node is an *asset* — a PDF you can flip through page by page, an image you can inspect, a video you can preview, a text block you can read. If it can't be visualized, it doesn't belong on the canvas.

现有的工作流平台（n8n、Coze、Dify）解决了一部分问题——它们让你可以把步骤串起来。但它们的节点是"操作"：冰冷的 API 调用、数据转换、逻辑门。你看不到正在被处理的内容。Rifflow 不一样：每个节点都是"资产"—— 可以逐页翻阅的 PDF、可以查看的图片、可以预览的视频、可以阅读的文本块。不能被可视化的内容，就不应该出现在画布上。

---

## The Core Idea: Distributed AI

The most underrated insight in AI today: **not every task needs GPT-4.**

当前 AI 领域最被低估的洞察：**不是每个任务都需要 GPT-4。**

A 80-page scanned research paper shouldn't be dumped wholesale into the most expensive model. The smart approach: let a lightweight model (Gemini Flash) skim the full document first and flag which pages contain complex formulas or key data. Then send only those pages to the powerful model (Gemini Pro) for deep analysis. Same quality output, a fraction of the cost.

一份 80 页的扫描版学术报告，不应该整个扔给最贵的模型。更聪明的做法是：先让轻量模型（Gemini Flash）以低分辨率通读全文，标注哪些页面含有复杂公式或关键数据，再把这些页面单独送给强模型（Gemini Pro）做精细解析。输出质量一样，成本降一个数量级。

Rifflow is built around this idea. You wire up the logic once, visually, and the platform handles the rest.

Rifflow 就是围绕这个理念构建的。你把逻辑连接好，画布上清晰可见，平台负责执行。

---

## What You Can Build

### 📄 Research & Document Analysis
### 📄 科研与文档分析

<p align="center">
  <img src="docs/screenshots/pdf-analysis.png" alt="PDF Analysis Workflow" width="100%" />
</p>

Feed a PDF into the canvas. Flip through it page by page. Connect it to a Text node and ask the AI to translate, summarize, extract data tables, or write a literature review — all with source page numbers cited. Connect your supervisor's email to the output node and get a report formatted exactly the way they want it.

把 PDF 导入画布，逐页预览。连接 Text 节点，让 AI 翻译、摘要、提取数据表格，或者撰写文献综述——全部附上原文页码。把你导师的邮件连到输出节点，直接生成符合他要求格式的汇报（笑）。

---

### 🖼️ Image & Video Generation
### 🖼️ 图片与视频生成

<p align="center">
  <img src="docs/screenshots/image-video-generation.png" alt="Image and Video Generation" width="100%" />
</p>

Text prompts flow into Image nodes, images flow into Video nodes. Chain them together to go from a written concept to a finished visual — or build a pipeline that generates dozens of variations from a single seed.

文字提示词流入图片节点，图片流入视频节点。串联起来，从一段文字出发，生成成品视觉内容——或者构建一条从单一 Seed 生成数十个变体的流水线。

---

### 🔀 Filter: LLM-Controlled Branching
### 🔀 Filter 节点：让 AI 决定走哪条路

<p align="center">
  <img src="docs/screenshots/filter-node.png" alt="Filter Node" width="100%" />
</p>

The Filter node lets an AI decide what passes downstream — and what gets dropped. Feed it a list of search results, and let the model keep only the relevant ones. Feed it a batch of generated images, and let it curate the best. No hardcoded rules, no manual sorting.

Filter 节点让 AI 来决定什么内容继续向下游传递、什么内容被过滤掉。把一批搜索结果丢进去，让模型只保留相关的；把一批生成的图片丢进去，让它挑出最好的。不需要写任何规则，不需要手动筛选。

---

### 🔁 Template: Parallel Instances at Scale
### 🔁 Template 节点：批量并行，各自独立

<p align="center">
  <img src="docs/screenshots/template-1-canvas.png" alt="Template Node on Canvas" width="100%" />
</p>
<p align="center">
  <img src="docs/screenshots/template-2-interior.png" alt="Template Sub-workflow Interior" width="100%" />
</p>
<p align="center">
  <img src="docs/screenshots/template-3-results.png" alt="Template Instance Results" width="100%" />
</p>

The Template node wraps a sub-workflow and runs it multiple times — each instance gets its own seed and its own set of results, navigable as pages. Write one prompt structure, generate ten different outputs. Design one visual concept, produce a full batch of variations. Combine Filter and Template, and you have a Turing-complete workflow.

Template 节点包裹一个子工作流，按你指定的数量多次执行——每个实例拥有独立的 Seed 和独立的输出结果，像翻页一样切换查看。写一个 prompt 结构，生成十个不同结果；设计一个视觉概念，批量产出所有变体。Filter + Template 组合在一起，Rifflow 实现了图灵完备。

---

### 🗂️ Workflow Library & Community
### 🗂️ 工作流库与社区

<p align="center">
  <img src="docs/screenshots/browser-library.png" alt="Workflow Browser" width="100%" />
</p>

Publish your workflows as templates for others to discover, use, and build on. Browse what others have made, fork a starting point, or keep your drafts private. A workflow is a reusable visual script — the closest thing to sharing a thought process.

把你的工作流发布成模板，供其他人发现、使用、二次创作。浏览社区里其他人做的东西，找一个起点开叉，或者把草稿留给自己用。一个工作流就是一个可复用的可视化脚本——最接近"分享一种思路"的形式。

---

### 💾 Local Backup — Canvas Pack
### 💾 本地备份 — Canvas Pack

Every canvas can be exported as a single `.zip` file directly from the toolbar — all assets (images, PDFs, videos) and the full workflow structure bundled together. Drop the file back in to restore everything exactly as it was. One project, one file.

每个画布都可以从工具栏一键导出为 `.zip` 文件——所有资产（图片、PDF、视频）和完整的工作流结构打包在一起。把文件重新拖入即可完整还原。一个项目，一个文件。

---

## Compared to Alternatives

| | Rifflow | n8n / Coze | ComfyUI | OpenClaw / Claude |
|---|---|---|---|---|
| Nodes are visual assets | ✅ | ❌ | Partial | ❌ |
| PDF page-by-page preview | ✅ | ❌ | ❌ | ❌ |
| LLM-controlled branching | ✅ | Manual rules only | ❌ | ❌ |
| Turing-complete workflows | ✅ | ✅ | ✅ | ❌ |
| Designed for non-engineers | ✅ | ❌ | ❌ | ✅ |
| Cost-visible execution | ✅ | Partial | ✅ | ❌ |

---

## Roadmap

- **Mobile app** — monitor and nudge your running workflows from your phone, like a remote control for your AI tasks
- **手机端** — 在手机上看着任务被一项项执行，哪一项不满意随时微调
- Long-form video generation pipeline (theoretically possible today; waiting for video generation costs to come down)
- 长视频生成流水线（技术上已可实现，等待视频生成成本继续下降）
- Collaborative canvas (multi-user real-time editing)
- 多人实时协作画布

---

## Try It

**Live:** [rifflow-679499639694.asia-northeast1.run.app](https://rifflow-679499639694.asia-northeast1.run.app)

Rifflow is currently in early access — you'll need an invite code to sign up. [DM me on GitHub](https://github.com/yh161) to get one.

**在线体验：** 目前处于早期内测阶段，注册需要邀请码。[在 GitHub 私信我](https://github.com/yh161)获取。

---

## Self-Hosting

### Prerequisites

- Node.js 20+
- Docker (PostgreSQL + MinIO)
- API keys: OpenRouter, Replicate

### Setup

```bash
git clone https://github.com/yh161/rifflow.git
cd rifflow
npm install
```

Create `.env.local`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/rifflow"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret"
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"
MINIO_BUCKET="node-images"
OPENROUTER_API_KEY="sk-or-..."
REPLICATE_API_TOKEN="r8_..."
```

```bash
docker compose up -d
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + React 19 |
| Canvas | ReactFlow 11 |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js |
| File Storage | MinIO / Google Cloud Storage |
| AI — Text | OpenRouter API |
| AI — Image / Video | Replicate API |
| Rich Text | TipTap (Markdown + KaTeX) |

---

## License

MIT
