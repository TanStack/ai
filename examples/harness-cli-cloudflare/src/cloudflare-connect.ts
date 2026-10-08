import { maskKey } from '@tanstack/ai/byok'
import { defineCommand, definePlugin } from '@tanstack/ai-harness'

/** The plugin's name. The screen reads its state, like a provider-keys state. */
export const CLOUDFLARE = 'example/cloudflare'

// The credential with the account id and the gateway id, next to the
// `cloudflare` credential that holds the API token.
const ACCOUNT_ID = 'cloudflare-account'
const TOKEN_PAGE = 'https://dash.cloudflare.com/profile/api-tokens'

/** The Cloudflare account and AI Gateway that the models use. */
export interface CloudflareAccount {
  accountId: string
  gatewayId: string
}

// The account the adapters read when they are made, just before each call.
// ponytail: one account for the process, so the CLI serves one user.
let current: CloudflareAccount | undefined

/** The account from the env vars, the shortcut without /connect. */
function envAccount() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) return undefined
  return {
    accountId,
    gatewayId: process.env.CLOUDFLARE_AI_GATEWAY_ID || 'default',
  }
}

/** The account the models use. Throws with the command to run when none. */
export function cloudflareAccount() {
  const account = current ?? envAccount()
  if (!account) {
    throw new Error(
      'No Cloudflare account yet. Run /connect cloudflare to connect it.',
    )
  }
  return account
}

/**
 * The REST config of a Cloudflare adapter: the user's token, and the
 * connected account and AI Gateway, so each call goes through the gateway.
 */
export function cloudflareRest(token: string) {
  const { accountId, gatewayId } = cloudflareAccount()
  return { accountId, apiKey: token, gateway: { id: gatewayId } }
}

function isAccount(value: unknown): value is CloudflareAccount {
  return (
    typeof value === 'object' &&
    value !== null &&
    'accountId' in value &&
    typeof value.accountId === 'string' &&
    'gatewayId' in value &&
    typeof value.gatewayId === 'string'
  )
}

/** The accounts the token can use, from the Cloudflare API. */
async function accountsOf(token: string) {
  const response = await fetch(
    'https://api.cloudflare.com/client/v4/accounts?per_page=50',
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!response.ok) {
    throw new Error(
      `Cloudflare refused the token (${response.status}). Make one with Workers AI and AI Gateway permissions.`,
    )
  }
  const body: { result?: Array<{ id: string; name: string }> } =
    await response.json()
  return body.result ?? []
}

/**
 * `/connect cloudflare` and `/disconnect cloudflare`: the API token, the
 * account, and the AI Gateway of the models. They are saved in the
 * session's credential store (the Worker, encrypted). The env vars
 * `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and
 * `CLOUDFLARE_AI_GATEWAY_ID` work when nothing is saved.
 */
export function cloudflareConnect() {
  return definePlugin({
    name: CLOUDFLARE,
    setup: async (ctx) => {
      const state = ctx.state<{
        providers: Array<{ id: string; label: string; state: string }>
      }>({ providers: [] })

      /** Read the saved account, and tell the screen where the token comes from. */
      const refresh = async () => {
        const [token, saved] = await Promise.all([
          ctx.credentials.get('cloudflare'),
          ctx.credentials.get(ACCOUNT_ID),
        ])
        const parsed: unknown =
          saved?.type === 'api_key' ? JSON.parse(saved.value) : undefined
        current = isAccount(parsed) ? parsed : undefined
        const where =
          token?.type === 'api_key'
            ? 'connected'
            : process.env.CLOUDFLARE_API_TOKEN
              ? 'env'
              : 'missing'
        await state.update(() => ({
          providers: [{ id: 'cloudflare', label: 'Cloudflare', state: where }],
        }))
      }
      await refresh()

      /** Ask a question, and give back the answer as trimmed text. */
      const ask = async (message: string, secret = false) =>
        String((await ctx.session.ask({ message, secret })) ?? '').trim()

      /** The account for `token`: the only one, or the one the user picks. */
      const pickAccount = async (token: string) => {
        const accounts = await accountsOf(token)
        const [only] = accounts
        if (accounts.length === 1 && only) return only
        if (accounts.length === 0) {
          const id = await ask('Paste your Cloudflare account ID')
          return { id, name: id }
        }
        const list = accounts
          .map((account, index) => `${index + 1}. ${account.name}`)
          .join('\n')
        const answer = await ask(`Which Cloudflare account?\n${list}`)
        const picked = accounts[Number(answer) - 1]
        if (!picked) throw new Error(`No account ${answer}. Nothing was saved.`)
        return picked
      }

      return {
        commands: {
          'connect:cloudflare': defineCommand({
            description:
              'Connect your Cloudflare account for Workers AI and AI Gateway',
            run: async () => {
              ctx.session.authRequired({
                connector: 'cloudflare',
                url: TOKEN_PAGE,
              })
              const token = await ask(
                'Paste a Cloudflare API token with Workers AI and AI Gateway permissions. The page to make one is open in your browser.',
                true,
              )
              if (token === '') {
                throw new Error(
                  'No Cloudflare token was given. Nothing was saved.',
                )
              }
              const account = await pickAccount(token)
              const gatewayId =
                (await ask('Your AI Gateway ID (press Enter for "default")')) ||
                'default'
              await ctx.credentials.set('cloudflare', {
                type: 'api_key',
                value: token,
              })
              await ctx.credentials.set(ACCOUNT_ID, {
                type: 'api_key',
                value: JSON.stringify({ accountId: account.id, gatewayId }),
              })
              await refresh()
              return `Connected to Cloudflare: ${account.name}, gateway ${gatewayId}, token ...${maskKey(token)}.`
            },
          }),
          'disconnect:cloudflare': defineCommand({
            description: 'Remove your Cloudflare token and account',
            run: async () => {
              await ctx.credentials.delete('cloudflare')
              await ctx.credentials.delete(ACCOUNT_ID)
              await refresh()
              return 'Disconnected from Cloudflare.'
            },
          }),
        },
      }
    },
  })
}
