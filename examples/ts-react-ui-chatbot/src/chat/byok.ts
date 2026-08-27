import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'

export const byok = defineByok({
  storage: defaultByokStorage(),
})

// Env OPENAI_API_KEY on the server can fill the request. Do not block send
// when the browser has no saved key.
byok.setServerCoverage(true)
