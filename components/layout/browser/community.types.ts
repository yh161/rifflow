// Community template client-side types (without canvasSnapshot)
export interface TemplateSummary {
  id: string
  name: string
  description: string | null
  thumbnail: string | null
  category: string
  tags: string[]
  pricingType: "free" | "pay_per_use" | "subscription"
  priceInPoints: number | null   // Points consumed per execution, null = free
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
  general:   "All",
  video:     "Video Creation",
  marketing: "Marketing Automation",
  ecommerce: "E-commerce",
  coding:    "Developer Tools",
  writing:   "Content Writing",
  data:      "Data Analysis",
}

// Single template card props
export interface TemplateCardProps {
  template: TemplateSummary
  aspectRatio?: "portrait" | "square"   // portrait = 3/4, square = 1/1
  width?: number
  height?: number
  className?: string
  isEditing?: boolean                   // Whether currently editing (no context menu)
  onFavorite?: (id: string, action: "added" | "removed") => void
  onExecute?: (template: TemplateSummary) => void
  onDelete?: (id: string) => void
  onUnpublish?: (id: string) => void
  onRepublish?: (id: string) => void
  onLoadToCanvas?: (id: string) => void
  onCopyToDraft?: (id: string) => void
  onCopyAndLoadToCanvas?: (id: string) => void
  onOpenDetail?: (template: TemplateSummary) => void
}
