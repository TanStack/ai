import type {
  AnyClientTool,
  AudioVisualization,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeSessionConfig,
  RealtimeToken,
} from '@tanstack/ai'

/**
 * Structural contract for the `RealtimeAdapter` / `RealtimeConnection` types
 * from `@tanstack/ai-client`.
 *
 * We duplicate the shapes here (and verify structural compatibility in a
 * dev-only type check — see `tests/realtime-contract.drift.test-d.ts`) so that
 * `@tanstack/ai-grok` does not impose `@tanstack/ai-client` as a `peerDependency`.
 * Consumers only need `@tanstack/ai-client` at the point where they actually
 * construct a `RealtimeClient`, not when they import this adapter.
 *
 * If `@tanstack/ai-client` ever changes these interfaces, the drift check
 * will fail and we must update this file in lockstep.
 */

export interface RealtimeAdapter {
  provider: string
  connect: (
    token: RealtimeToken,
    clientTools?: ReadonlyArray<AnyClientTool>,
  ) => Promise<RealtimeConnection>
}

export interface RealtimeConnection {
  disconnect: () => Promise<void>
  startAudioCapture: () => Promise<void>
  stopAudioCapture: () => void
  sendText: (text: string) => void
  sendImage: (imageData: string, mimeType: string) => void
  sendToolResult: (callId: string, result: string) => void
  updateSession: (config: Partial<RealtimeSessionConfig>) => void
  interrupt: () => void
  on: <TEvent extends RealtimeEvent>(
    event: TEvent,
    handler: RealtimeEventHandler<TEvent>,
  ) => () => void
  getAudioVisualization: () => AudioVisualization
}
