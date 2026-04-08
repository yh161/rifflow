// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  SHARED MODEL REGISTRY — single source of truth for all model options.     ║
// ║  Frontend panels import these for dropdowns.                               ║
// ║  Backend (constants.ts) derives routing maps from these definitions.       ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  ADDING A NEW REPLICATE MODEL                                              ║
// ║  ─────────────────────────────────────────────────────────────────────────  ║
// ║  1. Find the model path on https://replicate.com                           ║
// ║  2. ALWAYS verify the input schema before coding. Run:                     ║
// ║                                                                            ║
// ║     # Unversioned model:                                                   ║
// ║     node -e "                                                              ║
// ║       require('dotenv').config({path:'.env'});                             ║
// ║       fetch('https://api.replicate.com/v1/models/OWNER/NAME',              ║
// ║         {headers:{'Authorization':'Bearer '+process.env.REPLICATE_API_TOKEN}}) ║
// ║       .then(r=>r.json())                                                   ║
// ║       .then(d=>{                                                           ║
// ║         const p=d?.latest_version?.openapi_schema?.components             ║
// ║                  ?.schemas?.Input?.properties;                             ║
// ║         const req=d?.latest_version?.openapi_schema?.components           ║
// ║                    ?.schemas?.Input?.required??[];                         ║
// ║         const out=d?.latest_version?.openapi_schema?.components           ║
// ║                    ?.schemas?.Output;                                      ║
// ║         if(p) Object.entries(p).forEach(([k,v])=>                         ║
// ║           console.log(k+(req.includes(k)?'[REQ]':''),                     ║
// ║                        JSON.stringify(v).slice(0,100)));                   ║
// ║         console.log('OUTPUT:',JSON.stringify(out));                        ║
// ║       })"                                                                  ║
// ║                                                                            ║
// ║     # Versioned model (replace HASH with version id):                     ║
// ║     # Use /v1/models/OWNER/NAME/versions/HASH instead                     ║
// ║                                                                            ║
// ║  3. Fill in orModel, replicateTokenParam, replicateImageParam,            ║
// ║     replicateImageSingle, params[] to match the ACTUAL schema.            ║
// ║  4. The backend reads these fields — wrong values = 422 errors.           ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

export interface ModelParam {
  key: string       // parameter key sent to API — must match exact Replicate/OpenRouter param name
  label: string     // display label in UI
  options: string[] // select options (stored/sent as-is, numeric strings are converted to numbers by backend)
  default: string   // default value
}

/**
 * Image slot definition for video models that accept images as named API params
 * (as opposed to kling-v3-omni which uses <<<image_N>>> inline prompt syntax).
 * Each slot maps to an exact Replicate input field name.
 * Array slots (e.g. reference_images) store as indexed keys: reference_images_0, _1, _2.
 */
export interface VideoSlotDef {
  key: string        // exact Replicate API field name (e.g. "start_image", "image", "reference_images")
  label: string      // UI display label
  array?: true       // true = array field; renders maxCount individual slots
  maxCount?: number  // for array slots: number of individual slot cells to show
}

export interface ModelDef {
  id: string                          // internal key used in node data & API calls
  name: string                        // display name shown in UI
  orModel: string                     // model path: OpenRouter string OR "owner/name[:version]" for Replicate
  backend: "openrouter" | "replicate" // which API to call
  params?: ModelParam[]               // model-specific parameters shown in panel (key = exact API param name)
  supportsImageInput?: boolean        // whether model accepts upstream image nodes
  replicateNoTemperature?: boolean    // don't send temperature param (e.g. Claude, GPT)
  replicateTokenParam?: string        // max-tokens param name — must match the key in params[]
  // ── Replicate multimodal image fields (verified via API schema) ─────────────
  // If unsure about a new model, run the node snippet above to check!
  replicateImageParam?: string        // field name for images: "images" (Gemini), "image" (Claude), "image_input" (GPT/image models)
  replicateImageSingle?: boolean      // if true, pass only first image as a plain string (Claude: image is single URI, not array)
  // ── Video-specific image input modes ────────────────────────────────────
  videoSlots?: VideoSlotDef[]         // explicit named image slots (slot-based models: grok/kling-v3/veo)
  supportsInlineImageRef?: boolean    // kling-v3-omni: images in prompt become <<<image_N>>> + reference_images[]
  // ── Image-specific slot input (replicate image models with named image params) ──
  imageInputSlots?: VideoSlotDef[]    // named image input slots for image models (e.g. nano-banana-pro image_input[])
}

export interface ProgressProfile {
  /** asymptotic cap before backend confirms done */
  max: number
  /** UI smoothing factor when chasing target progress (higher = faster catch-up) */
  ease: number
  /** p50 runtime anchor (ms) */
  p50Ms?: number
  /** p90 runtime anchor (ms) */
  p90Ms?: number
}

// Model-specific progress pacing for frontend fake progress.
// Keep this in shared registry to avoid duplicate mapping in polling logic.
export const MODEL_PROGRESS_PROFILE: Record<string, ProgressProfile> = {
  // Text models: faster perceived progress
  "gemini-2.5-flash": { max: 0.95, ease: 0.35, p50Ms: 6000, p90Ms: 12000 },
  "gemini-3.1-pro":   { max: 0.94, ease: 0.33, p50Ms: 6000, p90Ms: 16000 },
  "claude-opus-4.6":  { max: 0.93, ease: 0.3,  p50Ms: 6500, p90Ms: 12000 },
  "gpt-5.2":          { max: 0.93, ease: 0.3,  p50Ms: 6500, p90Ms: 12000 },
  "deepseek-v3":      { max: 0.94, ease: 0.33, p50Ms: 5000, p90Ms: 10000 },
  "qwen3-32b":        { max: 0.94, ease: 0.33, p50Ms: 5200, p90Ms: 10200 },
  "llama-3.3-70b":    { max: 0.92, ease: 0.3,  p50Ms: 6800, p90Ms: 12500 },
  "llama-3.1-8b":     { max: 0.94, ease: 0.34, p50Ms: 4800, p90Ms: 9200 },

  // Image models: slower than text
  "nano-banana":      { max: 0.96, ease: 0.24, p50Ms: 8000, p90Ms: 15000 },
  "nano-banana-pro":  { max: 0.96, ease: 0.22, p50Ms: 9500, p90Ms: 18000 },

  // Video models: slowest
  "grok-video":           { max: 0.96, ease: 0.18, p50Ms: 14000, p90Ms: 26000 },
  "kling-v3-video":       { max: 0.96, ease: 0.15, p50Ms: 20000, p90Ms: 50000 },
  "kling-v3-omni-video":  { max: 0.96, ease: 0.15, p50Ms: 20000, p90Ms: 50000 },
  "veo-3.1":              { max: 0.96, ease: 0.13, p50Ms: 30000, p90Ms: 90000 },
  "veo-3.1-fast":         { max: 0.96, ease: 0.15, p50Ms: 20000, p90Ms: 60000 },
}

// ── Shared param groups ──────────────────────────────────────────────────────

/** OpenRouter text models: temperature only */
const OPENROUTER_TEXT_PARAMS: ModelParam[] = [
  { key: "temperature", label: "Temperature", options: ["0.3", "0.7", "1.0", "1.5"], default: "0.7" },
]

/**
 * Gemini base params (applies to both 2.5 Flash and 3.1 Pro).
 * Verified schema fields: temperature (0–2), top_p, max_output_tokens, system_instruction
 */
const GEMINI_BASE_PARAMS: ModelParam[] = [
  { key: "temperature",       label: "Temperature", options: ["0.3", "0.7", "1.0", "1.5", "2.0"],       default: "1.0"  },
  { key: "top_p",             label: "Top P",       options: ["0.7", "0.9", "0.95", "1.0"],              default: "0.95" },
  { key: "max_output_tokens", label: "Max Tokens",  options: ["2048", "4096", "8192", "16384", "32768"], default: "8192" },
]

/**
 * Llama params — both models use `max_tokens` (NOT `max_new_tokens`).
 * Verified via Replicate schema for:
 *   lucataco/ollama-llama3.3-70b: max_tokens(default:512), prompt[REQ], temperature, top_p
 *   meta/meta-llama-3-8b-instruct: max_tokens(default:512), prompt, temperature, top_p, top_k, etc.
 * Output: array of strings (x-cog-array-display: concatenate)
 */
const LLAMA_PARAMS: ModelParam[] = [
  { key: "temperature", label: "Temperature", options: ["0.3", "0.5", "0.7", "1.0"],    default: "0.7"  },
  { key: "top_p",       label: "Top P",       options: ["0.7", "0.9", "0.95", "1.0"],   default: "0.95" },
  { key: "max_tokens",  label: "Max Tokens",  options: ["1024", "2048", "4096", "8192"], default: "2048" },
]

// ════════════════════════════════════════════════════════════════════════════════
// TEXT MODELS
// ════════════════════════════════════════════════════════════════════════════════

export const TEXT_MODELS: ModelDef[] = [

  // ── Google Gemini 2.5 Flash via Replicate ─────────────────────────────────
  // Verified schema (2026-03): https://replicate.com/google/gemini-2.5-flash
  //   INPUT:  prompt[REQ](string), images(URI[]), videos(URI[]), temperature,
  //           top_p, thinking_budget(int), dynamic_thinking(bool),
  //           max_output_tokens(int), system_instruction(string)
  //   OUTPUT: string (streaming text, returned as final string by Replicate)
  {
    id: "gemini-2.5-flash", name: "Gemini 2.5 Flash",
    orModel: "google/gemini-2.5-flash", backend: "replicate",
    supportsImageInput: true,
    replicateImageParam: "images",           // URI array — multiple images supported
    replicateTokenParam: "max_output_tokens",
    params: [
      ...GEMINI_BASE_PARAMS,
      // thinking_budget: 0 = disable thinking; higher = more reasoning (max 24576)
      { key: "thinking_budget", label: "Thinking", options: ["0", "1024", "4096", "8192", "16384"], default: "0" },
    ],
  },

  // ── Google Gemini 3.1 Pro via Replicate ───────────────────────────────────
  // Verified schema (2026-03): https://replicate.com/google/gemini-3.1-pro
  //   INPUT:  prompt[REQ](string), audio(URI), images(URI[]), videos(URI[]),
  //           temperature, top_p, thinking_level(enum low/medium/high),
  //           max_output_tokens(int), system_instruction(string)
  //   OUTPUT: string
  {
    id: "gemini-3.1-pro", name: "Gemini 3.1 Pro",
    orModel: "google/gemini-3.1-pro", backend: "replicate",
    supportsImageInput: true,
    replicateImageParam: "images",           // URI array — multiple images supported
    replicateTokenParam: "max_output_tokens",
    params: [
      ...GEMINI_BASE_PARAMS,
      { key: "thinking_level", label: "Thinking", options: ["low", "medium", "high"], default: "high" },
    ],
  },

  // ── Anthropic Claude Opus 4.6 via Replicate ───────────────────────────────
  // Verified schema (2026-03): https://replicate.com/anthropic/claude-opus-4.6
  //   INPUT:  prompt[REQ](string), image(URI — SINGLE string, NOT array!),
  //           max_tokens(int, default:8192, max:128000),
  //           system_prompt(string), max_image_resolution(float)
  //   OUTPUT: ??? (check output schema if adding streaming support)
  //   NOTE:   Does NOT accept temperature. Only ONE image per request.
  {
    id: "claude-opus-4.6", name: "Claude Opus 4.6",
    orModel: "anthropic/claude-opus-4.6", backend: "replicate",
    supportsImageInput: true,
    replicateImageParam: "image",            // ⚠️ single URI string, NOT array
    replicateImageSingle: true,              // pass imageDataUris[0] as string (first image only)
    replicateNoTemperature: true,            // Claude API does not accept temperature
    replicateTokenParam: "max_tokens",
    params: [
      { key: "max_tokens", label: "Max Tokens", options: ["4096", "8192", "16384", "32768", "65536"], default: "8192" },
    ],
  },

  // ── OpenAI GPT-5.2 via Replicate ──────────────────────────────────────────
  // Verified schema (2026-03): https://replicate.com/openai/gpt-5.2
  //   INPUT:  prompt(string, nullable), messages(object[], OpenAI format),
  //           system_prompt(string), image_input(URI[], array),
  //           reasoning_effort(enum none/low/medium/high/xhigh),
  //           verbosity(enum low/medium/high),
  //           max_completion_tokens(int)
  //   OUTPUT: ??? (likely string or array — check if adding streaming)
  //   NOTE:   Does NOT accept temperature. Supports messages array OR prompt.
  //           We use prompt + image_input (simpler, both are optional).
  {
    id: "gpt-5.2", name: "GPT-5.2",
    orModel: "openai/gpt-5.2", backend: "replicate",
    supportsImageInput: true,
    replicateImageParam: "image_input",      // URI array — multiple images supported
    replicateNoTemperature: true,            // uses reasoning_effort instead of temperature
    replicateTokenParam: "max_completion_tokens",
    params: [
      { key: "max_completion_tokens", label: "Max Tokens", options: ["4096", "8192", "16384", "32768"],         default: "8192"   },
      { key: "reasoning_effort",      label: "Reasoning",  options: ["none", "low", "medium", "high", "xhigh"], default: "medium" },
      { key: "verbosity",             label: "Verbosity",  options: ["low", "medium", "high"],                   default: "medium" },
    ],
  },

  // ── Chinese models via OpenRouter ─────────────────────────────────────────
  // OpenRouter routes to the provider's API directly.
  // These models do NOT support image input.
  { id: "deepseek-v3", name: "DeepSeek V3", orModel: "deepseek/deepseek-chat", backend: "openrouter", params: OPENROUTER_TEXT_PARAMS },
  { id: "qwen3-32b",   name: "Qwen3 32B",   orModel: "qwen/qwen3-32b",         backend: "openrouter", params: OPENROUTER_TEXT_PARAMS },

  // ── Llama 3.3 70B via Replicate (versioned) ───────────────────────────────
  // Verified schema (2026-03): versioned prediction endpoint
  //   INPUT:  prompt[REQ](string), max_tokens(int,default:512),
  //           temperature(float,default:0.7), top_p(float,default:0.95)
  //   OUTPUT: array of strings (x-cog-array-display: concatenate)
  //   NOTE:   Uses `max_tokens` NOT `max_new_tokens`. Text-only (no image input).
  //           Versioned path → uses /v1/predictions with { version, input }.
  {
    id: "llama-3.3-70b", name: "Llama 3.3 70B",
    orModel: "lucataco/ollama-llama3.3-70b:29f7aa41293e897979d3e118ec8527542e5457417ae5d70e92b5f3f10033c5c3",
    backend: "replicate",
    replicateTokenParam: "max_tokens",
    params: LLAMA_PARAMS,
  },

  // ── Llama 3.1 8B via Replicate (unversioned) ─────────────────────────────
  // Verified schema (2026-03): https://replicate.com/meta/meta-llama-3-8b-instruct
  //   INPUT:  prompt(string), max_tokens(int,default:512), temperature(float,default:0.6),
  //           top_p(float,default:0.9), top_k(int,default:50), min_tokens,
  //           prompt_template, presence_penalty(default:1.15), frequency_penalty(default:0.2)
  //   OUTPUT: array of strings (x-cog-array-display: concatenate)
  //   NOTE:   Uses `max_tokens` NOT `max_new_tokens`. Text-only (no image input).
  {
    id: "llama-3.1-8b", name: "Llama 3.1 8B",
    orModel: "meta/meta-llama-3-8b-instruct",
    backend: "replicate",
    replicateTokenParam: "max_tokens",
    params: [
      // meta-llama-3-8b defaults: temperature=0.6, top_p=0.9
      { key: "temperature", label: "Temperature", options: ["0.3", "0.5", "0.6", "1.0"],    default: "0.6"  },
      { key: "top_p",       label: "Top P",       options: ["0.7", "0.85", "0.9", "1.0"],   default: "0.9"  },
      { key: "max_tokens",  label: "Max Tokens",  options: ["1024", "2048", "4096", "8192"], default: "2048" },
    ],
  },
]

// ════════════════════════════════════════════════════════════════════════════════
// IMAGE MODELS
// ════════════════════════════════════════════════════════════════════════════════

export const IMAGE_MODELS: ModelDef[] = [

  // ── Google nano-banana via Replicate ──────────────────────────────────────
  // Verified schema (2026-03): https://replicate.com/google/nano-banana
  //   INPUT:  prompt[REQ](string), image_input(URI[], optional — for img2img),
  //           aspect_ratio(enum), output_format(enum jpg/png)
  //   OUTPUT: string URI  (single image URL, NOT array)
  //   NOTE:   image_input accepts an array of upstream images (img2img / reference)
  {
    id: "nano-banana", name: "nano-banana", orModel: "google/nano-banana", backend: "replicate",
    supportsImageInput: false,
    params: [
      { key: "aspect_ratio",  label: "Aspect Ratio", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"], default: "1:1" },
      { key: "output_format", label: "Format",        options: ["jpg", "png"],                                                default: "jpg" },
    ],
  },

  // ── Google nano-banana-pro via Replicate ──────────────────────────────────
  // Verified schema (2026-03): https://replicate.com/google/nano-banana-pro
  //   INPUT:  prompt[REQ](string), image_input(URI[], optional — reference images),
  //           resolution(enum 1K/2K/4K), aspect_ratio(enum), output_format(enum),
  //           safety_filter_level, allow_fallback_model(bool,default:false)
  //   OUTPUT: string URI  (single image URL, NOT array)
  //   NOTE:   supportsImageInput=true — upstream image nodes connect as reference
  {
    id: "nano-banana-pro", name: "nano-banana-pro", orModel: "google/nano-banana-pro", backend: "replicate",
    supportsImageInput: true,
    // image_input[] comes via named image slots (not inline chips in rich text)
    imageInputSlots: [{ key: "image_input", label: "Reference", array: true, maxCount: 3 }],
    params: [
      { key: "aspect_ratio",  label: "Aspect Ratio", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "3:2", "2:3", "21:9"], default: "1:1" },
      { key: "resolution",    label: "Resolution",   options: ["1K", "2K", "4K"],                                                          default: "2K"  },
      { key: "output_format", label: "Format",       options: ["jpg", "png"],                                                               default: "jpg" },
    ],
  },
]

// ════════════════════════════════════════════════════════════════════════════════
// VIDEO MODELS
// ════════════════════════════════════════════════════════════════════════════════

export const VIDEO_MODELS: ModelDef[] = [

  // ── xAI Grok Video via Replicate ──────────────────────────────────────────
  // Verified schema (2026-03): https://replicate.com/xai/grok-imagine-video
  //   INPUT:  prompt[REQ](string), image(URI — SINGLE string, optional, for img2vid),
  //           video(URI — SINGLE string, optional, for video editing),
  //           duration(int,1–15,default:5), resolution(enum 720p/480p,default:720p),
  //           aspect_ratio(enum auto/16:9/…,default:auto)
  //   OUTPUT: string URI  (single video URL, NOT array)
  //   NOTE:   image field is a single URI string (not array).
  {
    id: "grok-video", name: "Grok Video", orModel: "xai/grok-imagine-video", backend: "replicate",
    supportsImageInput: true,
    videoSlots: [{ key: "image", label: "Image" }],
    params: [
      { key: "duration",     label: "Duration",     options: ["5", "10", "15"],                                            default: "5"    },
      { key: "resolution",   label: "Resolution",   options: ["720p", "480p"],                                             default: "720p" },
      { key: "aspect_ratio", label: "Aspect Ratio", options: ["auto", "16:9", "4:3", "1:1", "9:16", "3:4", "3:2", "2:3"], default: "auto" },
    ],
  },

  // ── Kling V3 Video via Replicate ──────────────────────────────────────────
  // Verified schema (2026-04): https://replicate.com/kwaivgi/kling-v3-video
  //   INPUT:  prompt[REQ](string), mode(enum standard/pro,default:pro),
  //           duration(int,3–15,default:5), aspect_ratio(enum 16:9/9:16/1:1,default:16:9),
  //           generate_audio(bool,default:false), negative_prompt(string),
  //           start_image(URI — SINGLE, first frame), end_image(URI, requires start_image)
  //   OUTPUT: string URI
  //   PRICING: standard=$0.168/s, standard+audio=$0.252/s, pro=$0.224/s, pro+audio=$0.336/s
  {
    id: "kling-v3-video", name: "Kling V3 Video", orModel: "kwaivgi/kling-v3-video", backend: "replicate",
    supportsImageInput: true,
    videoSlots: [
      { key: "start_image", label: "Start Frame" },
      { key: "end_image",   label: "End Frame"   },
    ],
    params: [
      { key: "mode",          label: "Mode",         options: ["standard", "pro"],          default: "pro"   },
      { key: "duration",      label: "Duration (s)", options: ["5", "10", "15"],             default: "5"     },
      { key: "aspect_ratio",  label: "Aspect Ratio", options: ["16:9", "9:16", "1:1"],       default: "16:9"  },
      { key: "generate_audio", label: "Audio",       options: ["false", "true"],             default: "false" },
    ],
  },

  // ── Kling V3 Omni Video via Replicate ─────────────────────────────────────
  // Verified schema (2026-04): https://replicate.com/kwaivgi/kling-v3-omni-video
  //   INPUT:  prompt[REQ](string), mode(enum standard/pro,default:pro),
  //           duration(int,3–15,default:5), aspect_ratio(enum 16:9/9:16/1:1,default:16:9),
  //           generate_audio(bool,default:false), start_image(URI — SINGLE),
  //           reference_images(URI[]), reference_video(URI)
  //   OUTPUT: string URI
  //   PRICING: standard=$0.168/s, standard+audio=$0.224/s, pro=$0.224/s, pro+audio=$0.28/s
  {
    id: "kling-v3-omni-video", name: "Kling V3 Omni", orModel: "kwaivgi/kling-v3-omni-video", backend: "replicate",
    supportsImageInput: true,
    supportsInlineImageRef: true,  // prompt supports <<<image_1>>>, images → reference_images[]
    // No videoSlots — images are inserted via rich text chips and sent as reference_images
    params: [
      { key: "mode",           label: "Mode",         options: ["standard", "pro"],    default: "pro"   },
      { key: "duration",       label: "Duration (s)", options: ["5", "10", "15"],       default: "5"     },
      { key: "aspect_ratio",   label: "Aspect Ratio", options: ["16:9", "9:16", "1:1"], default: "16:9"  },
      { key: "generate_audio", label: "Audio",        options: ["false", "true"],       default: "false" },
    ],
  },

  // ── Google Veo 3.1 via Replicate ──────────────────────────────────────────
  // Verified schema (2026-04): https://replicate.com/google/veo-3.1
  //   INPUT:  prompt[REQ](string), duration(enum 4/6/8,default:8),
  //           aspect_ratio(enum 16:9/9:16,default:16:9), resolution(enum 720p/1080p,default:1080p),
  //           generate_audio(bool,default:true), image(URI — SINGLE, start frame),
  //           last_frame(URI), reference_images(URI[1-3]), negative_prompt(string)
  //   OUTPUT: string URI
  //   PRICING: with_audio=$0.40/s, without_audio=$0.20/s
  {
    id: "veo-3.1", name: "Veo 3.1", orModel: "google/veo-3.1", backend: "replicate",
    supportsImageInput: true,
    videoSlots: [
      { key: "image",            label: "Image"      },
      { key: "last_frame",       label: "Last Frame" },
      { key: "reference_images", label: "References", array: true, maxCount: 3 },
    ],
    params: [
      { key: "duration",       label: "Duration (s)", options: ["4", "6", "8"],          default: "8"     },
      { key: "aspect_ratio",   label: "Aspect Ratio", options: ["16:9", "9:16"],          default: "16:9"  },
      { key: "resolution",     label: "Resolution",   options: ["720p", "1080p"],         default: "1080p" },
      { key: "generate_audio", label: "Audio",        options: ["false", "true"],         default: "true"  },
    ],
  },

  // ── Google Veo 3.1 Fast via Replicate ─────────────────────────────────────
  // Verified schema (2026-04): https://replicate.com/google/veo-3.1-fast
  //   INPUT:  prompt[REQ](string), duration(enum 4/6/8,default:8),
  //           aspect_ratio(enum 16:9/9:16,default:16:9), resolution(enum 720p/1080p,default:1080p),
  //           generate_audio(bool,default:true), image(URI — SINGLE, start frame),
  //           last_frame(URI), negative_prompt(string)
  //   OUTPUT: string URI
  //   PRICING: with_audio=$0.15/s, without_audio=$0.10/s
  {
    id: "veo-3.1-fast", name: "Veo 3.1 Fast", orModel: "google/veo-3.1-fast", backend: "replicate",
    supportsImageInput: true,
    videoSlots: [
      { key: "image",      label: "Image"      },
      { key: "last_frame", label: "Last Frame" },
    ],
    params: [
      { key: "duration",       label: "Duration (s)", options: ["4", "6", "8"],          default: "8"     },
      { key: "aspect_ratio",   label: "Aspect Ratio", options: ["16:9", "9:16"],          default: "16:9"  },
      { key: "resolution",     label: "Resolution",   options: ["720p", "1080p"],         default: "1080p" },
      { key: "generate_audio", label: "Audio",        options: ["false", "true"],         default: "true"  },
    ],
  },
]

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_TEXT_MODEL_ID  = "gemini-2.5-flash"
export const DEFAULT_IMAGE_MODEL_ID = IMAGE_MODELS[0].id
export const DEFAULT_VIDEO_MODEL_ID = VIDEO_MODELS[0].id
