// Service constants

import { TEXT_MODELS, IMAGE_MODELS, VIDEO_MODELS } from "@/lib/models"

// ── Text model definitions (includes backend routing) ─────────────────────────
export interface TextModelDef {
  modelPath: string
  backend: "openrouter" | "replicate"
  noTemperature?: boolean    // don't send temperature (Claude, GPT)
  tokenParam?: string        // max-tokens param name (default: "max_new_tokens")
  extraParamKeys?: string[]  // additional user-configurable param keys to forward (e.g. reasoning_effort)
  supportsImageInput?: boolean // whether model accepts image_url content blocks
  // ── Replicate multimodal image routing (verified via API schema) ─────────────
  imageParam?: string        // Replicate input field for images: "images"|"image"|"image_input"
  imageSingle?: boolean      // if true, pass only first image as a plain string (Claude)
}

/**
 * Full text model definitions keyed by model id.
 * Use this for routing: openrouter → OpenRouter API, replicate → Replicate API.
 */
export const TEXT_MODEL_DEFS: Record<string, TextModelDef> = Object.fromEntries(
  TEXT_MODELS.map(m => [m.id, {
    modelPath:          m.orModel,
    backend:            m.backend,
    noTemperature:      m.replicateNoTemperature,
    tokenParam:         m.replicateTokenParam,
    extraParamKeys:     m.params?.filter(p => p.key !== 'temperature').map(p => p.key),
    supportsImageInput: m.supportsImageInput,
    imageParam:         m.replicateImageParam,
    imageSingle:        m.replicateImageSingle,
  }])
)

/**
 * OpenRouter-only model path map (backward compat for OpenRouter callers).
 * Only contains models with backend === "openrouter".
 */
export const TEXT_MODEL_MAP: Record<string, string> = Object.fromEntries(
  TEXT_MODELS.filter(m => m.backend === "openrouter").map(m => [m.id, m.orModel])
)

// Image: { modelPath, backend }
export interface ImageModelDef {
  modelPath: string
  backend: "openrouter" | "replicate"
  modalities: string[]  // only used for openrouter
}
export const IMAGE_MODEL_MAP: Record<string, ImageModelDef> = Object.fromEntries(
  IMAGE_MODELS.map(m => [m.id, {
    modelPath:  m.orModel,
    backend:    m.backend,
    modalities: ["image"],
  }])
)

// Video: { modelPath, backend }
export interface VideoModelDef {
  modelPath: string
  backend: "openrouter" | "replicate"
  imageParam?: string      // legacy single-image field (kept for grok fallback)
  inlineImageRef?: boolean // kling-v3-omni: images in multimodal content → <<<image_N>>> + reference_images[]
}
export const VIDEO_MODEL_MAP: Record<string, VideoModelDef> = Object.fromEntries(
  VIDEO_MODELS.map(m => [m.id, {
    modelPath:     m.orModel,
    backend:       m.backend,
    imageParam:    m.replicateImageParam,
    inlineImageRef: m.supportsInlineImageRef,
  }])
)

export const DEFAULT_IMAGE_MODEL_DEF: ImageModelDef = IMAGE_MODEL_MAP[IMAGE_MODELS[0].id]
export const DEFAULT_VIDEO_MODEL_DEF: VideoModelDef = VIDEO_MODEL_MAP[VIDEO_MODELS[0].id]
