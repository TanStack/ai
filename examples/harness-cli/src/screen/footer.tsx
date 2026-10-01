import { Box, Text } from 'ink'
import { REASONING_LEVELS } from '@tanstack/ai'
import { clampReasoningLevel } from '@tanstack/ai-models'
import { useSelector } from '@tanstack/react-store'
import { modelInfo, reasons } from '../harness'
import { PROVIDER_KEYS, USAGE, providerKeysIn, usageIn } from './keys'
import { ACCENT, compact } from './theme'
import type { SessionView } from '@tanstack/ai-harness/view'

const BAR = 10

/**
 * The status bar at the bottom: the model, how much of its context the
 * conversation fills, and the tokens and model calls so far. It follows the
 * session live. The features and the key hints are in the header.
 */
export function Footer({ view }: { view: SessionView }) {
  const model = useSelector(view.store, (state) =>
    String(state.config.find((entry) => entry.key === 'model')?.value ?? '?'),
  )
  const effort = useSelector(
    view.store,
    (state) => state.config.find((entry) => entry.key === 'effort')?.value,
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
  const window = info?.record.contextWindow
  // The level the model gets: the adapter moves an effort the model does not
  // have to the nearest one it has.
  const level = REASONING_LEVELS.find((name) => name === effort)
  const shownEffort =
    info && level && reasons(model)
      ? clampReasoningLevel(info.record, level)
      : undefined
  const share = window ? Math.min(1, usage.contextTokens / window) : 0
  const filled = Math.round(share * BAR)
  const barColor = share > 0.8 ? 'red' : share > 0.5 ? 'yellow' : 'green'
  const needsKey =
    info !== undefined &&
    keys.find((key) => key.id === info.provider)?.state === 'missing'
  // Each group keeps its width, and a group that does not fit goes to the
  // next line.
  return (
    <Box flexWrap="wrap" columnGap={3}>
      <Box flexShrink={0}>
        <Text color={needsKey ? 'red' : ACCENT} bold>{`◆ ${model}`}</Text>
        {needsKey ? (
          <Text color="red">{`  (run /connect ${info.provider})`}</Text>
        ) : null}
        {shownEffort ? <Text dimColor>{`  effort ${shownEffort}`}</Text> : null}
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>{'context '}</Text>
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
      </Box>
      <Box flexShrink={0}>
        <Text dimColor>{'tokens in '}</Text>
        <Text>{compact(usage.promptTokens)}</Text>
        <Text dimColor>{' out '}</Text>
        <Text>{compact(usage.completionTokens)}</Text>
      </Box>
      <Text dimColor>{`${usage.turns} model calls`}</Text>
    </Box>
  )
}
