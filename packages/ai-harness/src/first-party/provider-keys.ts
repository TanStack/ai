import { maskKey } from '@tanstack/ai/byok'
import { envKeyEntry } from '@tanstack/ai/byok/server'
import { defineCommand } from '../commands'
import { SESSION_PLUGIN_KEYS_NO_ENV, definePlugin } from '../plugins'
import type { ProviderKeys } from '@tanstack/ai'
import type { ByokProvider } from '@tanstack/ai/byok'
import type { CredentialsAccess } from '../auth'
import type { AnyCommand, CommandContext } from '../commands'

/** Signs the user in and resolves to an API key, for example `openrouterSignIn()`. */
type ProviderSignIn = (ctx: {
  open: (url: string) => void
  signal?: AbortSignal
}) => Promise<string>

/**
 * A provider the user can connect: its BYOK descriptor, with a sign-in when
 * it has one. `keyUrl` is the provider's page to make a key: `/connect` opens
 * it in the browser before it asks for the key.
 */
export type KeyProvider = ByokProvider & {
  signIn?: ProviderSignIn
  keyUrl?: string
}

export interface ProviderKeyStatus {
  id: string
  label: string
  /** `connected`: a saved key. `env`: the env var. `missing`: neither. */
  state: 'connected' | 'env' | 'missing'
}

/**
 * What UIs read from `state.plugins['tanstack/provider-keys']`. Every member
 * of the thread reads it, so it has no user's own keys: each provider is
 * `env` or `missing`. `/keys` shows the keys of the user who runs it.
 */
export interface ProviderKeysState {
  providers: Array<ProviderKeyStatus>
}

/**
 * `promise`, or a rejection once `signal` aborts. A cancelled `/connect`
 * stops waiting for the answer, and a late answer saves nothing.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal) {
  signal.throwIfAborted()
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    ),
  ])
}

/**
 * The state of one provider, and its `/keys` line. The key shows masked only.
 * Without a user, only the env var counts. An env var counts only when the
 * keys of the session read env vars (`allowServerEnvKeys`).
 */
async function describeKey(
  user: { credentials: CredentialsAccess; keys: ProviderKeys } | undefined,
  provider: ByokProvider,
  readsEnv: boolean,
) {
  const { id, label } = provider
  const status = (state: ProviderKeyStatus['state']) => ({ id, label, state })
  const saved = await user?.credentials.get(id)
  if (saved?.type === 'api_key') {
    return {
      status: status('connected'),
      line: `${label}: connected (key ...${maskKey(saved.value)})`,
    }
  }
  const env = envKeyEntry(provider)
  // The keys of the user read the env var only when the session allows it.
  const isRead = user ? (await user.keys.get(provider)) !== null : readsEnv
  if (env && isRead) {
    return {
      status: status('env'),
      line: `${label}: from the ${env.name} env var`,
    }
  }
  return {
    status: status('missing'),
    line: `${label}: missing. Run /connect ${id}.`,
  }
}

/**
 * Let each user connect their own model providers inside the app, so a
 * shipped harness needs no `.env` file. For each provider it adds
 * `/connect <id>` and `/disconnect <id>`, and `/keys` lists where each key
 * comes from. `/connect` runs the provider's `signIn` when it has one (the
 * host opens the browser), else it asks the user to paste the key. The key
 * is saved in the credential store of the user who runs `/connect`. A
 * `keyedAdapter(...)` for that provider then uses it. The env var still works
 * when no key is saved, unless the host has access without `allowServerEnvKeys`. Keys
 * show masked only (the last 4 characters). The plugin state lists only the
 * env vars that the session reads, as every member reads it.
 *
 * @param options.providers - BYOK descriptors, for example `openaiByok`. Add
 *   `signIn` for a provider with a browser sign-in, for example
 *   `{ ...openrouterByok, signIn: openrouterSignIn() }`, or `keyUrl` to open
 *   the provider's key page before the question, for example
 *   `{ ...openaiByok, keyUrl: 'https://platform.openai.com/api-keys' }`.
 *
 * @example
 * ```ts
 * plugins: () => [
 *   providerKeys({
 *     providers: [
 *       openaiByok,
 *       anthropicByok,
 *       { ...openrouterByok, signIn: openrouterSignIn() },
 *     ],
 *   }),
 * ]
 * ```
 */
export function providerKeys(options: {
  providers: ReadonlyArray<KeyProvider>
}) {
  const { providers } = options
  return definePlugin({
    name: 'tanstack/provider-keys',
    setup: async (ctx) => {
      const state = ctx.state<ProviderKeysState>({ providers: [] })
      // ponytail: the session tells it with the identity of `ctx.keys`.
      const readsEnv = ctx.keys !== SESSION_PLUGIN_KEYS_NO_ENV
      /** Check every provider for `user`, or for no user. */
      const describe = (user?: Parameters<typeof describeKey>[0]) =>
        Promise.all(
          providers.map((provider) => describeKey(user, provider, readsEnv)),
        )
      // No user at setup: the state shows the env vars only, and no command
      // writes the keys of one user into it.
      const described = await describe()
      await state.update(() => ({
        providers: described.map((entry) => entry.status),
      }))
      /** The `/keys` lines of the user who runs a command. */
      const linesOf = async ({ credentials, run }: CommandContext) =>
        (await describe({ credentials, keys: run.keys }))
          .map((entry) => entry.line)
          .join('\n')

      /**
       * The key from the provider's sign-in, else the one the user pastes.
       * It asks the user who runs the command.
       */
      const readKey = async (
        provider: KeyProvider,
        { signal, session, step }: CommandContext,
      ) => {
        const open = (url: string) =>
          session.authRequired({ connector: provider.id, url })
        if (provider.signIn) return provider.signIn({ open, signal })
        // No sign-in for other apps: open the page to make a key, then ask.
        // The log keeps the question, so a user on any host can answer it.
        if (provider.keyUrl) open(provider.keyUrl)
        return step.ask({
          name: 'key',
          message: provider.keyUrl
            ? `Paste your ${provider.label} API key. The page to make one is open in your browser.`
            : `Paste your ${provider.label} API key`,
          secret: true,
        })
      }

      const commands: Record<string, AnyCommand> = {
        keys: defineCommand({
          description:
            'Show the model providers and where their keys come from',
          run: (_input, command) => linesOf(command),
        }),
      }
      for (const provider of providers) {
        const { id, label } = provider
        commands[`connect:${id}`] = defineCommand({
          description: `Connect ${label} with your own key`,
          // The key belongs to the user who runs the command.
          run: async (_input, command) => {
            const { signal, credentials } = command
            const key = (
              await untilAborted(readKey(provider, command), signal)
            ).trim()
            if (key === '') {
              throw new Error(`No ${label} key was given. Nothing was saved.`)
            }
            await credentials.set({
              id,
              credential: { type: 'api_key', value: key },
            })
            return `Connected to ${label} (key ...${maskKey(key)}).`
          },
        })
        commands[`disconnect:${id}`] = defineCommand({
          description: `Remove your ${label} key`,
          run: async (_input, { credentials }) => {
            await credentials.delete(id)
            return `Disconnected from ${label}.`
          },
        })
      }
      return { commands }
    },
  })
}
