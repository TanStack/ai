import { Box, Text, useAnimation } from 'ink'
import { useSelector } from '@tanstack/react-store'
import { selectGoal } from '@tanstack/ai-harness/plugins'
import { Spinner } from './parts'
import type { SessionView } from '@tanstack/ai-harness/view'
import type { Recording } from '../voice'

export type VoiceState = 'idle' | 'starting' | 'recording' | 'transcribing'

/** A live level meter from the microphone loudness (0 to 32768). */
function LevelMeter({ recording }: { recording: Recording }) {
  const { time } = useAnimation({ interval: 80 })
  const level = recording.level()
  // Map loudness to 0..1 on a log scale: -60 dB is empty, 0 dB is full.
  const decibels = 20 * Math.log10(Math.max(level, 1) / 32768)
  const filled = Math.round(Math.min(1, Math.max(0, (decibels + 60) / 60)) * 16)
  const seconds = Math.floor(time / 1000)
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <Box>
      <Text color="red" bold>{`● REC ${clock}  `}</Text>
      <Text color={filled > 9 ? 'green' : filled > 4 ? 'yellow' : 'gray'}>
        {'▮'.repeat(filled)}
      </Text>
      <Text dimColor>{'▯'.repeat(16 - filled)}</Text>
      <Text dimColor>{`  ${recording.microphone}`}</Text>
    </Box>
  )
}

/** What waits for the user or runs now: sign-ins, approvals, voice, the turn. */
export function Status({
  view,
  voice,
  recording,
}: {
  view: SessionView
  voice: VoiceState
  recording: Recording | undefined
}) {
  const status = useSelector(view.store, (state) => state.status)
  const approvals = useSelector(view.store, (state) => state.approvals)
  const question = useSelector(view.store, (state) => state.questions.at(0))
  const signIns = useSelector(view.store, (state) => state.signIns)
  const goal = useSelector(view.store, selectGoal)
  return (
    <Box flexDirection="column" marginTop={1}>
      {signIns.map((signIn) => (
        <Text key={signIn.connector} color="magenta">
          {`◇ Continue in your browser for ${signIn.connector}${signIn.url ? `: ${signIn.url}` : ''}${signIn.userCode ? ` (code ${signIn.userCode})` : ''}`}
        </Text>
      ))}
      {approvals.length > 0 ? (
        <Text color="magenta" bold>
          {`◇ Approve ${approvals.map((item) => item.tool).join(', ')}? Type y or n.`}
        </Text>
      ) : null}
      {question ? <Text color="magenta">{`◇ ${question.message}`}</Text> : null}
      {goal ? (
        <Text color="green">{`◎ Goal: ${goal.text} (${goal.status}, round ${goal.round})`}</Text>
      ) : null}
      {voice === 'recording' && recording ? (
        <Box flexDirection="column">
          <LevelMeter recording={recording} />
          <Text dimColor>
            Let go of Ctrl+R (or tap it again) to send. Esc drops it.
          </Text>
        </Box>
      ) : voice === 'starting' ? (
        <Box>
          <Spinner color="red" />
          <Text color="red"> opening the microphone...</Text>
        </Box>
      ) : voice === 'transcribing' ? (
        <Box>
          <Spinner color="cyan" />
          <Text color="cyan"> listening to your voice message...</Text>
        </Box>
      ) : status === 'running' ? (
        <Box>
          <Spinner />
          <Text color="yellow"> working</Text>
          <Text dimColor> Esc cancels, typing steers</Text>
        </Box>
      ) : null}
    </Box>
  )
}
