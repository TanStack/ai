// Declaration companion generated from use-realtime-chat.tsrx.
import type { UseRealtimeChatOptions, UseRealtimeChatReturn } from './realtime-types';
/**
 * Octane hook for realtime voice conversations.
 *
 * Provides a simple interface for voice-to-voice AI interactions
 * with support for multiple providers (OpenAI, ElevenLabs, etc.).
 *
 * @param options - Configuration options including adapter and callbacks
 * @returns Hook return value with state and control methods
 *
 * @example
 * ```typescript
 * import { useRealtimeChat } from '@tanstack/ai-octane'
 * import { openaiRealtime } from '@tanstack/ai-openai'
 *
 * function VoiceChat() {
 *   const {
 *     status,
 *     mode,
 *     messages,
 *     connect,
 *     disconnect,
 *     inputLevel,
 *     outputLevel,
 *   } = useRealtimeChat({
 *     getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *     adapter: openaiRealtime(),
 *   })
 *
 *   return (
 *     <div>
 *       <p>Status: {status}</p>
 *       <p>Mode: {mode}</p>
 *       <button onClick={status === 'idle' ? connect : disconnect}>
 *         {status === 'idle' ? 'Start' : 'Stop'}
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export declare function useRealtimeChat(options: UseRealtimeChatOptions): UseRealtimeChatReturn;
