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

function extractImageUrls(content: string): Array<string> {
  const imageRegex = /!\[Generated Image\]\(([^)]+)\)/g
  const urls: Array<string> = []
  let match
  while ((match = imageRegex.exec(content)) !== null) {
    urls.push(match[1])
  }
  return urls
}

async function testGeminiImageGeneration() {
  console.log(
    '🚀 Testing OpenRouter image generation with gemini-2.5-flash-image\n',
  )

  const adapter = createOpenRouter(apiKey!)

  const model = 'google/gemini-2.5-flash-image'
  const prompt =
    'Generate a beautiful image of a futuristic cityscape at night with neon lights and flying cars.'

  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]

  console.log('📤 Sending image generation request:')
  console.log('  Model:', model)
  console.log('  Prompt:', prompt)
  console.log()

  try {
    console.log('⏳ Generating image (this may take a moment)...\n')

    let fullContent = ''

    const stream = adapter.chatStream({
      model,
      messages,
      providerOptions: {
        modalities: ['image', 'text'],
      },
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        fullContent = chunk.content
      }

      if (chunk.type === 'done') {
        console.log('📊 Usage:', chunk.usage)
      }

      if (chunk.type === 'error') {
        console.error('❌ Stream error:', chunk.error)
        return false
      }
    }

    const imageUrls = extractImageUrls(fullContent)

    console.log('\n' + '='.repeat(60))
    console.log('📊 Test Summary (Gemini Image Generation):')

    const textContent = fullContent
      .replace(/!\[Generated Image\]\([^)]+\)/g, '')
      .trim()
    if (textContent) {
      console.log(
        '  Text response:',
        textContent.substring(0, 100) + (textContent.length > 100 ? '...' : ''),
      )
    }

    if (imageUrls.length > 0) {
      console.log('\n🖼️  Generated Images:')
      imageUrls.forEach((url, index) => {
        if (url.startsWith('data:image')) {
          console.log(
            `  Image ${index + 1}: [Base64 Data URL] (${url.length} chars)`,
          )
          console.log(`    Preview: ${url.substring(0, 80)}...`)
        } else {
          console.log(`  Image ${index + 1}: ${url}`)
        }
      })
    }

    console.log('\n  Images generated:', imageUrls.length)
    console.log('  Has images:', imageUrls.length > 0 ? '✅' : '❌')
    console.log('='.repeat(60))

    if (imageUrls.length === 0) {
      console.error('\n❌ FAIL: No images were generated')
      return false
    }

    console.log('\n✅ SUCCESS: Gemini image generation works correctly!')
    return true
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string }
    console.error('\n❌ ERROR:', err.message)
    console.error('Stack:', err.stack)
    return false
  }
}

async function testFluxImageGeneration() {
  console.log('\n🚀 Testing OpenRouter image generation with flux.2-pro\n')

  const adapter = createOpenRouter(apiKey!)

  const model = 'black-forest-labs/flux.2-pro'
  const prompt =
    'Generate a beautiful landscape image of a mountain range at sunset with vibrant colors.'

  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]

  console.log('📤 Sending image generation request:')
  console.log('  Model:', model)
  console.log('  Prompt:', prompt)
  console.log()

  try {
    console.log('⏳ Generating image (this may take a moment)...\n')

    let fullContent = ''

    const stream = adapter.chatStream({
      model,
      messages,
      providerOptions: {
        modalities: ['image', 'text'],
      },
    })

    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        fullContent = chunk.content
      }

      if (chunk.type === 'done') {
        console.log('📊 Usage:', chunk.usage)
      }

      if (chunk.type === 'error') {
        console.error('❌ Stream error:', chunk.error)
        return false
      }
    }

    const imageUrls = extractImageUrls(fullContent)

    console.log('\n' + '='.repeat(60))
    console.log('📊 Test Summary (Flux Image Generation):')

    const textContent = fullContent
      .replace(/!\[Generated Image\]\([^)]+\)/g, '')
      .trim()
    if (textContent) {
      console.log(
        '  Text response:',
        textContent.substring(0, 100) + (textContent.length > 100 ? '...' : ''),
      )
    }

    if (imageUrls.length > 0) {
      console.log('\n🖼️  Generated Images:')
      imageUrls.forEach((url, index) => {
        if (url.startsWith('data:image')) {
          console.log(
            `  Image ${index + 1}: [Base64 Data URL] (${url.length} chars)`,
          )
          console.log(`    Preview: ${url.substring(0, 80)}...`)
        } else {
          console.log(`  Image ${index + 1}: ${url}`)
        }
      })
    }

    console.log('\n  Images generated:', imageUrls.length)
    console.log('  Has images:', imageUrls.length > 0 ? '✅' : '❌')
    console.log('='.repeat(60))

    if (imageUrls.length === 0) {
      console.error('\n❌ FAIL: No images were generated')
      return false
    }

    console.log('\n✅ SUCCESS: Flux image generation works correctly!')
    return true
  } catch (error: unknown) {
    const err = error as { message?: string; stack?: string }
    console.error('\n❌ ERROR:', err.message)
    console.error('Stack:', err.stack)
    return false
  }
}

async function runAllTests() {
  console.log('='.repeat(60))
  console.log('🧪 OpenRouter Image Generation Tests')
  console.log('='.repeat(60))
  console.log()

  const results = {
    geminiImageGeneration: false,
    fluxImageGeneration: false,
  }

  results.geminiImageGeneration = await testGeminiImageGeneration()
  results.fluxImageGeneration = await testFluxImageGeneration()

  console.log('\n' + '='.repeat(60))
  console.log('📊 Final Test Results:')
  console.log(
    '  Image Generation (gemini-2.5-flash-image):',
    results.geminiImageGeneration ? '✅' : '❌',
  )
  console.log(
    '  Image Generation (flux.2-pro):',
    results.fluxImageGeneration ? '✅' : '❌',
  )
  console.log('='.repeat(60))

  if (!results.geminiImageGeneration || !results.fluxImageGeneration) {
    console.error('\n❌ Some tests failed')
    process.exit(1)
  }

  console.log('\n✅ All image generation tests passed!')
  process.exit(0)
}

runAllTests()
