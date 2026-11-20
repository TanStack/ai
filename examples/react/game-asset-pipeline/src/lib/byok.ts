import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { falByok } from '@tanstack/ai-fal/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [falByok],
})

// Send the request even with no key in the tab. The server then reads
// FAL_KEY from .env, or returns 401.
byok.setServerCoverage(true)
