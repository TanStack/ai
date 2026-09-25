import { defineByokProvider } from '@tanstack/ai/byok'

export const vercelGatewayByok = defineByokProvider({
  id: 'vercel-gateway',
  label: 'Vercel AI Gateway',
  env: ['AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN'],
})
