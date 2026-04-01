// Handler registry — maps nodeType → JobHandler

import type { JobHandler } from "./types"
import { textHandler } from "./text.handler"
import { imageHandler } from "./image.handler"
import { videoHandler } from "./video.handler"
import { filterHandler } from "./filter.handler"
import { templateHandler } from "./template.handler"
import { pdfHandler } from "./pdf.handler"

/** Lookup a handler by nodeType. Text/seed share the same handler. */
export const HANDLER_BY_TYPE: Record<string, JobHandler> = {
  text:     textHandler,
  seed:     textHandler,
  image:    imageHandler,
  video:    videoHandler,
  filter:   filterHandler,
  pdf:      pdfHandler,
  template: templateHandler,
}

export type { JobHandler, HandlerContext } from "./types"
