import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { reactorByok } from '@tanstack/ai-reactor/byok'

export { reactorByok }

export const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [reactorByok],
})

// The relay can use REACTOR_API_KEY when the browser has no saved key.
byok.setServerCoverage(true)
