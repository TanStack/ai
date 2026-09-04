import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { reactorByok } from '@tanstack/ai-reactor/byok'
import { createServerFn } from '@tanstack/react-start'

export { reactorByok }

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [reactorByok],
})

// Let the relay decide when a key is missing. The server prefers the
// `x-byok-*` header, then env. Without coverage, the client would block
// start before env fallback can run.
byok.setServerCoverage(true)

/** Booleans only. Which keyed providers have an env key on the relay. */
export const getEnvKeyStatus = createServerFn({ method: 'GET' }).handler(
  (): Record<string, boolean> => ({
    [reactorByok.id]: Boolean(process.env.REACTOR_API_KEY),
  }),
)
