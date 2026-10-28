import type { ChatModelId } from '@/components/ai/model-selector'

export let selectedModel: ChatModelId = 'gpt-5.5'

export function setSelectedModel(next: ChatModelId) {
  selectedModel = next
}
