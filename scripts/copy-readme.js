import { copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))

const targets = [
  'packages/ai/README.md',
  'packages/ai-client/README.md',
  'packages/ai-devtools/README.md',
  'packages/ai-gemini/README.md',
  'packages/ai-ollama/README.md',
  'packages/ai-openai/README.md',
  'packages/ai-openrouter/README.md',
  'packages/ai-preact/README.md',
  'packages/ai-react/README.md',
  'packages/ai-react-ui/README.md',
  'packages/ai-solid-ui/README.md',
  'packages/ai-vue/README.md',
  'packages/ai-vue-ui/README.md',
  'packages/preact-ai-devtools/README.md',
  'packages/react-ai-devtools/README.md',
  'packages/solid-ai-devtools/README.md',
]

for (const target of targets) {
  copyFileSync(join(rootDir, 'README.md'), join(rootDir, target))
}
