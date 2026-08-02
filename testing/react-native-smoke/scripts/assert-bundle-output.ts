import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const bundleDir = resolve(process.argv[2] ?? '.esbuild-smoke-dist')

const forbidden = [
  '/api/chat',
  '@anthropic-ai/sdk',
  '@fal-ai/client',
  '@google/genai',
  '@google/generative-ai',
  '@openrouter/sdk',
  '@tanstack/ai-react-ui',
  '@tanstack/react-ai-devtools',
  '@tanstack/solid-ai-devtools',
  'elevenlabs',
  'node:fs',
  'node:http',
  'node:https',
  'node:stream',
  'ollama',
  'openai',
  'react-dom',
  'solid-js',
  'svelte',
  'vue',
  'zod',
]

function filesIn(dir: string): Array<string> {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? filesIn(full) : [full]
  })
}

const failures: Array<string> = []
let scannedJavaScriptFiles = 0

for (const file of filesIn(bundleDir)) {
  if (!/\.(js|json|html)$/.test(file)) continue
  if (/\.js$/.test(file)) scannedJavaScriptFiles += 1
  const source = readFileSync(file, 'utf8')
  for (const token of forbidden) {
    if (source.includes(token)) {
      failures.push(`${file} contains forbidden bundle token ${token}`)
    }
  }
}

if (scannedJavaScriptFiles === 0) {
  failures.push(`${bundleDir} does not contain any JavaScript output files`)
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('React Native bundle smoke passed.')
