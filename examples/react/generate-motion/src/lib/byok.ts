import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { falByok } from '@tanstack/ai-fal/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [falByok],
})
