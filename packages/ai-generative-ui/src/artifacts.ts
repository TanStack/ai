/**
 * Open Generative UI — Frame-tier artifact middleware (Draft 0.2 §8).
 *
 * A TanStack AI `ChatMiddleware` that injects the `create/revise/list/read`
 * artifact tools into `chat()`, plus the async `FrameArtifactStore` primitive
 * and its in-memory / `BlobStore`-backed implementations. Kept on a dedicated
 * subpath (`@tanstack/ai-generative-ui/artifacts`) so the browser-safe main
 * entry and React renderer stay free of `@tanstack/ai`.
 */

export * from './artifacts/store'
export * from './artifacts/operations'
export * from './artifacts/middleware'
export * from './artifacts/resource-uri'
