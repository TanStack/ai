import {
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
} from '@/components/ai/prompt-input'

export const CHAT_MODELS = [
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.2', label: 'GPT-5.2' },
] as const

export type ChatModelId = (typeof CHAT_MODELS)[number]['id']

export function ModelSelector({
  value,
  onChange,
}: {
  value: ChatModelId
  onChange: (value: ChatModelId) => void
}) {
  return (
    <PromptInputModelSelect
      onValueChange={(next) => {
        if (next === 'gpt-5.5' || next === 'gpt-5.2') onChange(next)
      }}
      value={value}
    >
      <PromptInputModelSelectTrigger className="h-8 w-[9.5rem] border-0 bg-transparent shadow-none">
        <PromptInputModelSelectValue />
      </PromptInputModelSelectTrigger>
      <PromptInputModelSelectContent>
        {CHAT_MODELS.map((model) => (
          <PromptInputModelSelectItem key={model.id} value={model.id}>
            {model.label}
          </PromptInputModelSelectItem>
        ))}
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  )
}
