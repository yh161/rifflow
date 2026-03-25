// 社区模板的客户端类型（不含 canvasSnapshot）
export interface TemplateSummary {
  id: string
  name: string
  description: string | null
  thumbnail: string | null
  category: string
  tags: string[]
  pricingType: "free" | "pay_per_use" | "subscription"
  priceInPoints: number | null   // 每次执行消耗的积分，null = free
  executionsCount: number
  favoritesCount: number
  rating: number
  isFeatured: boolean
  publishedAt: string | null
  creatorId: string
  isFavorited?: boolean
  creator: {
    id: string
    name: string | null
    image: string | null
  }
}

export interface TemplatesResponse {
  templates: TemplateSummary[]
  total: number
}

export type TemplateCategory =
  | "general"
  | "video"
  | "marketing"
  | "ecommerce"
  | "coding"
  | "writing"
  | "data"

export const CATEGORY_LABELS: Record<string, string> = {
  general:   "全部",
  video:     "视频创作",
  marketing: "营销自动化",
  ecommerce: "电商运营",
  coding:    "开发工具",
  writing:   "文字内容",
  data:      "数据分析",
}

// 单个模板卡片的 props
export interface TemplateCardProps {
  template: TemplateSummary
  aspectRatio?: "portrait" | "square"   // portrait = 3/4, square = 1/1
  width?: number
  height?: number
  className?: string
  onFavorite?: (id: string, action: "added" | "removed") => void
  onExecute?: (template: TemplateSummary) => void
  onDelete?: (id: string) => void
  onUnpublish?: (id: string) => void
  onRepublish?: (id: string) => void
  onLoadToCanvas?: (id: string) => void
}
