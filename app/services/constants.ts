// Service constants

export const CREDIT_COST: Record<string, number> = { 
  text: 1, 
  gate: 1, 
  image: 1 
}

export const TEXT_MODEL_MAP: Record<string, string> = {
  "gemini-2.0-flash":  "google/gemini-2.0-flash-001",
  "gemini-1.5-pro":    "google/gemini-pro-1.5",
  "gpt-4o":            "openai/gpt-4o",
  "claude-3-5-sonnet": "anthropic/claude-3.5-sonnet",
}

export const IMAGE_MODEL_MAP: Record<string, { id: string; modalities: string[] }> = {
  "seedream-4.5": {
    id:         "bytedance-seed/seedream-4.5",
    modalities: ["image"],
  },
}