import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

const targets = [
  'packages/typescript/ai/README.md',
  'packages/typescript/ai-client/README.md',
  'packages/typescript/ai-devtools/README.md',
  'packages/typescript/ai-gemini/README.md',
  'packages/typescript/ai-ollama/README.md',
  'packages/typescript/ai-openai/README.md',
  'packages/typescript/ai-openrouter/README.md',
  'packages/typescript/ai-preact/README.md',
  'packages/typescript/ai-react/README.md',
  'packages/typescript/ai-react-ui/README.md',
  'packages/typescript/ai-solid-ui/README.md',
  'packages/typescript/ai-vue/README.md',
  'packages/typescript/ai-vue-ui/README.md',
  'packages/typescript/preact-ai-devtools/README.md',
  'packages/typescript/react-ai-devtools/README.md',
  'packages/typescript/solid-ai-devtools/README.md',
]

for (const target of targets) {
  copyFileSync(join(rootDir, 'README.md'), join(rootDir, target))
}
