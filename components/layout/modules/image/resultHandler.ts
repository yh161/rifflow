import type { ResultHandlerContext } from '../_registry'

/**
 * Image result handler:
 * - New format (result.src): server already uploaded to MinIO
 * - Legacy format (result.b64): decode → upload to MinIO from client
 * Then measures natural dimensions and resizes the node.
 */
export async function resultHandler(
  result: Record<string, unknown>,
  ctx: ResultHandlerContext,
): Promise<void> {
  let src: string

  if (typeof result.src === 'string' && result.src.length > 0) {
    src = result.src as string
  } else {
    // Legacy b64 format — upload from client
    const mime   = typeof result.mime === 'string' ? result.mime : 'image/png'
    const b64    = typeof result.b64 === 'string' ? result.b64 : ''
    const binary = atob(b64)
    const ab     = new ArrayBuffer(binary.length)
    const ia     = new Uint8Array(ab)
    for (let i = 0; i < binary.length; i++) ia[i] = binary.charCodeAt(i)
    const blob = new Blob([ab], { type: mime })
    try {
      const form = new FormData()
      form.append(
        'file',
        new File([blob], `generated.${mime.split('/')[1] || 'png'}`, { type: mime }),
      )
      const upRes  = await fetch('/api/upload', { method: 'POST', body: form })
      const upJson = await upRes.json()
      if (!upRes.ok || !upJson.url) throw new Error('upload failed')
      src = upJson.url as string
    } catch {
      src = URL.createObjectURL(blob)
    }
  }

  // Measure natural dimensions
  const img = new window.Image()
  img.src   = src
  await new Promise<void>(resolve => { img.onload = () => resolve() })

  const nw    = img.naturalWidth
  const nh    = img.naturalHeight
  const scale = 180 / Math.min(nw, nh)
  const w     = Math.round(nw * scale)
  const h     = Math.round(nh * scale)

  ctx.setNodes(ns => ns.map(n => {
    if (n.id !== ctx.nodeId) return n
    return {
      ...n,
      style: { ...n.style, width: w, height: h },
      data:  {
        ...n.data,
        src,
        naturalWidth:  nw,
        naturalHeight: nh,
        width:         w,
        height:        h,
        done:          true,
        isGenerating:  false,
        activeJobId:   undefined,
      },
    }
  }))
}
