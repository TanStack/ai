export {
  toolCacheMiddleware,
  type ToolCacheMiddlewareOptions,
  type ToolCacheStorage,
  type ToolCacheEntry,
} from './tool-cache'

export {
  contentGuardMiddleware,
  type ContentGuardMiddlewareOptions,
  type ContentGuardRule,
  type ContentFilteredInfo,
} from './content-guard'

// otelMiddleware is exported from the dedicated subpath
// `@tanstack/ai/middlewares/otel` so that importing the main middlewares barrel
// does not eagerly require `@opentelemetry/api` (which is an optional peer
// dependency).
