import type { ResultHandlerContext } from '../_registry'

/**
 * Video result handler:
 * 1. Sets Replicate URL immediately so user can play right away
 * 2. Background: fetches video → uploads to MinIO → replaces with permanent URL
 */
export async function resultHandler(
  result: Record<string, any>,
  ctx: ResultHandlerContext,
): Promise<void> {
  const replicateUrl = result.videoSrc as string

  // 1. Set Replicate URL immediately
  ctx.setNodes(ns => ns.map(n =>
    n.id !== ctx.nodeId ? n : {
      ...n,
      data: {
        ...n.data,
        videoSrc:     replicateUrl,
        isGenerating: false,
        activeJobId:  undefined,
      },
    }
  ))

  // 2. Background: upload to MinIO for permanent storage
  ;(async () => {
    try {
      const res = await fetch(replicateUrl)
      if (!res.ok) throw new Error('fetch failed')
      const blob = await res.blob()
      const mime = blob.type || 'video/mp4'
      const ext  = mime.split('/')[1] || 'mp4'
      const form = new FormData()
      form.append('file', new File([blob], `generated.${ext}`, { type: mime }))
      const upRes  = await fetch('/api/upload', { method: 'POST', body: form })
      const upJson = await upRes.json()
      if (!upRes.ok || !upJson.url) throw new Error('upload failed')
      // Replace Replicate URL with permanent MinIO URL
      ctx.setNodes(ns => ns.map(n =>
        n.id !== ctx.nodeId ? n : {
          ...n,
          data: { ...n.data, videoSrc: upJson.url as string },
        }
      ))
    } catch (err) {
      console.warn('[video] MinIO mirror failed, keeping Replicate URL', err)
    }
  })()
}
