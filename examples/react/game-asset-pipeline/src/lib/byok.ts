import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { falByok } from '@tanstack/ai-fal/byok'
import { meshyByok } from '@tanstack/ai-meshy/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [falByok, meshyByok],
})

// Send the request even with no key in the tab. The server then reads
// FAL_KEY or MESHY_API_KEY from .env, or returns 401.
byok.setServerCoverage(true)
