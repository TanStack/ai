import { useSignal } from '@qwik.dev/core'
import type { Signal } from '@qwik.dev/core'

export interface UseAiQwikHelloReturn {
  count: Signal<number>
  message: string
}

export function createAiQwikHelloMessage(name = 'Qwik') {
  return `Hello ${name} from TanStack AI Qwik`
}

export function useAiQwikHello(name = 'Qwik'): UseAiQwikHelloReturn {
  const count = useSignal(0)

  return {
    count,
    message: createAiQwikHelloMessage(name),
  }
}
