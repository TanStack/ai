import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { chat, maxIterations, toServerSentEventsStream } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-gemini'
import { ollamaText } from '@tanstack/ai-ollama'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Guitar data (embedded for simplicity)
const guitars = [
  {
    id: 1,
    name: 'TanStack Ukelele',
    image: '/example-ukelele-tanstack.jpg',
    description:
      'Premium koa-wood ukulele featuring exclusive TanStack branding.',
    shortDescription: 'Premium koa-wood ukulele with TanStack branding.',
    price: 299,
  },
  {
    id: 2,
    name: 'Video Game Guitar',
    image: '/example-guitar-video-games.jpg',
    description: 'A unique acoustic guitar with a video game design.',
    shortDescription: 'Unique electric guitar with video game design.',
    price: 699,
  },
  {
    id: 3,
    name: 'Superhero Guitar',
    image: '/example-guitar-superhero.jpg',
    description: 'Bold black electric guitar with superhero logo design.',
    shortDescription: 'Bold black electric guitar with superhero logo.',
    price: 699,
  },
  {
    id: 4,
    name: 'Motherboard Guitar',
    image: '/example-guitar-motherboard.jpg',
    description: 'Tech-inspired electric guitar with LED lights.',
    shortDescription: 'Tech-inspired guitar with LED lights.',
    price: 649,
  },
  {
    id: 5,
    name: 'Racing Guitar',
    image: '/example-guitar-racing.jpg',
    description: 'Aerodynamic guitar with racing stripes.',
    shortDescription: 'Aerodynamic guitar with racing stripes.',
    price: 679,
  },
  {
    id: 6,
    name: 'Steamer Trunk Guitar',
    image: '/example-guitar-steamer-trunk.jpg',
    description: 'Semi-hollow body guitar with brass hardware.',
    shortDescription: 'Semi-hollow body guitar with brass hardware.',
    price: 629,
  },
  {
    id: 7,
    name: "Travelin' Man Guitar",
    image: '/example-guitar-traveling.jpg',
    description: 'Acoustic guitar with vintage postcards.',
    shortDescription: 'Acoustic guitar with vintage postcards.',
    price: 499,
  },
  {
    id: 8,
    name: 'Flowerly Love Guitar',
    image: '/example-guitar-flowers.jpg',
    description: 'Acoustic guitar with hand-painted floral designs.',
    shortDescription: 'Acoustic guitar with floral designs.',
    price: 599,
  },
]

// Tool definitions
const getGuitarsToolDef = toolDefinition({
  name: 'getGuitars',
  description: 'Get all products from the database',
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      image: z.string(),
      description: z.string(),
      shortDescription: z.string(),
      price: z.number(),
    }),
  ),
})

const getGuitars = getGuitarsToolDef.server(() => guitars)

const recommendGuitarToolDef = toolDefinition({
  name: 'recommendGuitar',
  description: 'REQUIRED tool to display a guitar recommendation to the user.',
  inputSchema: z.object({
    id: z
      .union([z.string(), z.number()])
      .describe('The ID of the guitar to recommend'),
  }),
  outputSchema: z.object({ id: z.number() }),
})

const getPersonalGuitarPreferenceToolDef = toolDefinition({
  name: 'getPersonalGuitarPreference',
  description:
    "Get the user's guitar preference from their local browser storage",
  inputSchema: z.object({}),
  outputSchema: z.object({ preference: z.string() }),
})

const addToWishListToolDef = toolDefinition({
  name: 'addToWishList',
  description: "Add a guitar to the user's wish list (requires approval)",
  inputSchema: z.object({ guitarId: z.string() }),
  outputSchema: z.object({
    success: z.boolean(),
    guitarId: z.string(),
    totalItems: z.number(),
  }),
  needsApproval: true,
})

const addToCartToolDef = toolDefinition({
  name: 'addToCart',
  description: 'Add a guitar to the shopping cart (requires approval)',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cartId: z.string(),
    guitarId: z.string(),
    quantity: z.number(),
    totalItems: z.number(),
  }),
  needsApproval: true,
})

const addToCartToolServer = addToCartToolDef.server((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
  totalItems: args.quantity,
}))

const SYSTEM_PROMPT = `You are a helpful assistant for a guitar store.

CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THIS EXACT WORKFLOW:

When a user asks for a guitar recommendation:
1. FIRST: Use the getGuitars tool (no parameters needed)
2. SECOND: Use the recommendGuitar tool with the ID of the guitar you want to recommend
3. NEVER write a recommendation directly - ALWAYS use the recommendGuitar tool

IMPORTANT:
- The recommendGuitar tool will display the guitar in a special, appealing format
- You MUST use recommendGuitar for ANY guitar recommendation
- ONLY recommend guitars from our inventory (use getGuitars first)
- The recommendGuitar tool has a buy button - this is how customers purchase
- Do NOT describe the guitar yourself - let the recommendGuitar tool do it
`

type Provider = 'openai' | 'anthropic' | 'gemini' | 'ollama'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'api-handler',
      configureServer(server) {
        server.middlewares.use('/api/chat', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }

          let body = ''
          for await (const chunk of req) {
            body += chunk
          }

          try {
            const { messages, data } = JSON.parse(body)
            const provider: Provider = data?.provider || 'openai'
            const model: string | undefined = data?.model

            let adapter

            let selectedModel: string

            switch (provider) {
              case 'anthropic':
                selectedModel = model || 'claude-sonnet-4-5-20250929'
                adapter = anthropicText(selectedModel)
                break
              case 'gemini':
                selectedModel = model || 'gemini-2.0-flash'
                adapter = geminiText(selectedModel)
                break
              case 'ollama':
                selectedModel = model || 'mistral:7b'
                adapter = ollamaText(selectedModel)
                break
              case 'openai':
              default:
                selectedModel = model || 'gpt-4o'
                adapter = openaiText(selectedModel)
                break
            }

            console.log(
              `[API] Using provider: ${provider}, model: ${selectedModel}`,
            )

            const abortController = new AbortController()

            const stream = chat({
              adapter,
              tools: [
                getGuitars,
                recommendGuitarToolDef,
                addToCartToolServer,
                addToWishListToolDef,
                getPersonalGuitarPreferenceToolDef,
              ],
              systemPrompts: [SYSTEM_PROMPT],
              agentLoopStrategy: maxIterations(20),
              messages,
              abortController,
            })

            const readableStream = toServerSentEventsStream(
              stream,
              abortController,
            )

            // Set headers
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')

            // Stream the body
            const reader = readableStream.getReader()
            const pump = async () => {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(value)
              }
              res.end()
            }
            pump().catch((err) => {
              console.error('Stream error:', err)
              res.end()
            })
          } catch (error: any) {
            console.error('[API] Error:', error)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({ error: error.message || 'An error occurred' }),
            )
          }
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
