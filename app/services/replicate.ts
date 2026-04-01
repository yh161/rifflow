/**
 * Replicate API helper
 * Supports synchronous (Prefer: wait) and polling fallback.
 */

const BASE = "https://api.replicate.com/v1"

function headers() {
  return {
    "Authorization": `Bearer ${process.env.REPLICATE_API_TOKEN}`,
    "Content-Type": "application/json",
  }
}

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms))
}

/**
 * Run a Replicate model and return the output.
 * modelPath: "owner/name" (latest version) or "owner/name:version"
 * timeoutMs: max wait for polling (default 5 min)
 */
export async function runReplicate(
  modelPath: string,
  input: Record<string, unknown>,
  timeoutMs = 300_000,
): Promise<unknown> {
  // Split version if present: "owner/name:version"
  const [ownerName, version] = modelPath.split(":")
  const [owner, name] = ownerName.split("/")

  let createUrl: string
  let body: Record<string, unknown>

  if (version) {
    // Versioned model
    createUrl = `${BASE}/predictions`
    body = { version, input }
  } else {
    // Latest version of a model
    createUrl = `${BASE}/models/${owner}/${name}/predictions`
    body = { input }
  }

  // Use Prefer: wait=60 for synchronous response on fast models
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: { ...headers(), "Prefer": "wait=60" },
    body: JSON.stringify(body),
  })

  if (!createRes.ok) {
    throw new Error(`Replicate create error (${createRes.status}): ${await createRes.text()}`)
  }

  const prediction = await createRes.json()

  if (prediction.status === "succeeded") return prediction.output
  if (prediction.status === "failed") throw new Error(`Replicate failed: ${prediction.error}`)

  // Poll for slower models (video)
  const id = prediction.id
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(5000)
    const pollRes = await fetch(`${BASE}/predictions/${id}`, { headers: headers() })
    if (!pollRes.ok) throw new Error(`Replicate poll error: ${await pollRes.text()}`)
    const p = await pollRes.json()
    if (p.status === "succeeded") return p.output
    if (p.status === "failed") throw new Error(`Replicate prediction failed: ${p.error}`)
    // status: "starting" | "processing" → keep polling
  }

  throw new Error("Replicate prediction timed out")
}

/** Fetch a URL and convert to base64 */
export async function urlToBase64(url: string): Promise<{ b64: string; mime: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image from Replicate: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const b64 = Buffer.from(buffer).toString("base64")
  const mime = res.headers.get("content-type") || "image/png"
  return { b64, mime: mime.split(";")[0] }
}

/** Extract a single URL from Replicate output (string or string[]) */
export function extractUrl(output: unknown): string {
  if (typeof output === "string") return output
  if (Array.isArray(output) && output.length > 0) return output[0] as string
  throw new Error("Replicate returned unexpected output format")
}
