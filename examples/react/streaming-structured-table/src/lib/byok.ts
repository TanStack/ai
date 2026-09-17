import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { openrouterByok } from '@tanstack/ai-openrouter/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [openrouterByok],
})
