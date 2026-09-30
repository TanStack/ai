import { Box, Spacer, Text } from 'ink'
import { useSelector } from '@tanstack/react-store'
import { features, modelInfo } from '../harness'
import { PROVIDER_KEYS, USAGE, isOn, providerKeysIn, usageIn } from './keys'
import { ACCENT, compact } from './theme'
import type { SessionView } from '@tanstack/ai-harness/view'

const BAR = 10

/**
 * The status bar at the bottom: the model, how much of its context the
 * conversation fills, the tokens and model calls so far, and which features
 * are on. It follows the session live, so a `/connect` turns features on.
 */
export function Footer({ view }: { view: SessionView }) {
  const model = useSelector(view.store, (state) =>
    String(state.config.find((entry) => entry.key === 'model')?.value ?? '?'),
  )
  // The plugin states themselves, so the bar renders only when they change.
  const usageState = useSelector(view.store, (state) => state.plugins[USAGE])
  const keysState = useSelector(
    view.store,
    (state) => state.plugins[PROVIDER_KEYS],
  )
  const usage = usageIn(usageState)
  const keys = providerKeysIn(keysState)
  const info = modelInfo[model]
  const window = info?.contextWindow
  const share = window ? Math.min(1, usage.contextTokens / window) : 0
  const filled = Math.round(share * BAR)
  const barColor = share > 0.8 ? 'red' : share > 0.5 ? 'yellow' : 'green'
  const needsKey =
    info !== undefined &&
    keys.find((key) => key.id === info.provider)?.state === 'missing'
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={needsKey ? 'red' : ACCENT} bold>{`◆ ${model}`}</Text>
        {needsKey ? (
          <Text color="red">{`  (run /connect ${info.provider})`}</Text>
        ) : null}
        <Text dimColor>{'   context '}</Text>
        <Text>
          {compact(usage.contextTokens)}
          {window ? `/${compact(window)}` : ''}
        </Text>
        {window ? (
          <>
            <Text> </Text>
            <Text color={barColor}>{'▰'.repeat(filled)}</Text>
            <Text dimColor>{'▱'.repeat(BAR - filled)}</Text>
            <Text dimColor>{` ${Math.round(share * 100)}%`}</Text>
          </>
        ) : null}
        <Text dimColor>{'   tokens in '}</Text>
        <Text>{compact(usage.promptTokens)}</Text>
        <Text dimColor>{' out '}</Text>
        <Text>{compact(usage.completionTokens)}</Text>
        <Text dimColor>{`   ${usage.turns} model calls`}</Text>
      </Box>
      <Box flexWrap="wrap">
        {features.map((feature) => {
          const on = isOn(feature, keys)
          return (
            <Text key={feature.name} color={on ? 'green' : 'gray'}>
              {`${on ? '●' : '○'} ${feature.name}  `}
            </Text>
          )
        })}
        <Spacer />
        <Text dimColor>
          {'Ctrl+R talk   / commands   ↑↓ history   Esc cancel'}
        </Text>
      </Box>
    </Box>
  )
}
