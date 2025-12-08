import { createOpenRouter } from '../src/index'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envContent = readFileSync(join(__dirname, '.env.local'), 'utf-8')
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      process.env[match[1].trim()] = match[2].trim()
    }
  })
} catch {}

const apiKey = process.env.OPENROUTER_API_KEY

if (!apiKey) {
  console.error('❌ OPENROUTER_API_KEY not found in .env.local')
  process.exit(1)
}

async function testWebSearch() {
  console.log('🚀 Testing OpenRouter web search via plugins\n')

  const adapter = createOpenRouter(apiKey!)

  const messages = [
    {
      role: 'user' as const,
      content:
        'What is the latest news about AI today? Please search the web and summarize.',
    },
  ]

  console.log('📤 Sending request with web search plugin:')
  console.log('  Model: openai/gpt-4o-mini')
  console.log('  Plugin: web (engine: exa, max_results: 5)')
  console.log('  User message:', messages[0].content)
  console.log()

  try {
    console.log('📥 Streaming response...\n')

    let fullContent = ''
    let hasContent = false

    const stream = adapter.chatStream({
      model: 'openai/gpt-4o-mini',
      messages,
      providerOptions: {
        plugins: [
          {
            id: 'web',
            engine: 'exa',
            max_results: 5,
          },
        ],
      },
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        hasContent = true
        fullContent += chunk.delta
        process.stdout.write(chunk.delta)
      }

      if (chunk.type === 'done') {
        console.log('\n\n📊 Usage:', chunk.usage)
      }

      if (chunk.type === 'error') {
        console.error('\n❌ Stream error:', chunk.error)
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 Test Summary:')
    console.log('  Content received:', hasContent ? '✅' : '❌')
    console.log('  Content length:', fullContent.length, 'characters')
    console.log('='.repeat(60))

    if (!hasContent) {
      console.error('\n❌ FAIL: No content was received from the stream')
      process.exit(1)
    }

    console.log('\n✅ SUCCESS: Web search plugin works correctly!')
    process.exit(0)
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string }
    console.error('\n❌ ERROR:', err.message)
    console.error('Stack:', err.stack)
    process.exit(1)
  }
}

testWebSearch()
