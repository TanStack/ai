import type codeMode from '@tanstack/ai-isolate-cloudflare/worker'
import type { Account } from './account'
import type { SessionLog } from './session-log'

/** The bindings and secrets of the Worker (see wrangler.jsonc). */
export interface Env {
  SESSIONS: DurableObjectNamespace<SessionLog>
  ACCOUNT: DurableObjectNamespace<Account>
  MEDIA: R2Bucket
  /** The Dynamic Workers binding that code mode runs programs with. */
  LOADER?: Parameters<(typeof codeMode)['fetch']>[1]['LOADER']
  /** The CLI sends it as `Authorization: Bearer <secret>`. */
  HARNESS_SECRET: string
  /** Encrypts the keys at rest. */
  ENCRYPTION_KEY: string
}
