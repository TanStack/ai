import { fal } from '@fal-ai/client'
import { toFalClientOptions } from './client'
import type { FalClientConfig } from './client'

/**
 * Configure the global `fal` client of `@fal-ai/client` with this config, for
 * apps that call `fal` themselves. The adapters do not use the global client.
 *
 * ponytail: this file is the only static import of `@fal-ai/client`. It is a
 * separate module, so a bundle that does not import this function drops it.
 *
 * @param config the API key (or `FAL_KEY` from the environment), an optional
 * proxy URL, and an optional `fetch`.
 */
export function configureFalClient(config?: FalClientConfig): void {
  fal.config(toFalClientOptions(config))
}
