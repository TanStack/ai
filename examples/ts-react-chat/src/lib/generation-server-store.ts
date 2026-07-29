import { sqlitePersistence } from './sqlite-persistence'

let instance: ReturnType<typeof sqlitePersistence> | undefined

/**
 * Server-side generation persistence for the example app — the counterpart to
 * `generation-persistence.ts`, which is the client-driven half.
 *
 * Backed by the same self-contained `node:sqlite` adapter the persistent-chat
 * demo uses (`./sqlite-persistence`), in its own database file. It supplies the
 * three stores generation needs: `generationRuns` (the run record
 * `reconstructGeneration` reads back) plus `artifacts` + `blobs` (the generated
 * bytes, so a restored `result` can actually render its image rather than
 * coming back `null`).
 *
 * Durable on purpose. The POST that records a run and the GET that serves its
 * bytes are separate requests, and an in-memory store would also lose every
 * artifact whenever Vite re-evaluates this module on HMR — leaving artifact
 * URLs already on screen to 404 mid-session. On disk, none of that applies:
 * generated images survive an edit, a restart, and a second worker. `.data/` is
 * gitignored.
 *
 * Lazily opened so importing this module never opens the database in a browser
 * bundle.
 */
export function generationServerPersistence() {
  return (instance ??= sqlitePersistence({
    url: './.data/generation.db',
    migrate: true,
  }))
}

/** Serve URL for a stored artifact — must match the GET route below it. */
export function artifactServeUrl(artifactId: string): string {
  return `/api/generate/image?artifact=${encodeURIComponent(artifactId)}`
}
