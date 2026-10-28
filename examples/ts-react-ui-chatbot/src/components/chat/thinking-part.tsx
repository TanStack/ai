import type { PartProps } from '@tanstack/ai-react/ui'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai/reasoning'
import type { chatOptions } from '@/chat/options'

export function ThinkingPart({
  part,
}: PartProps<typeof chatOptions, 'thinking'>) {
  return (
    <Reasoning className="w-full">
      <ReasoningTrigger />
      <ReasoningContent>{part.content}</ReasoningContent>
    </Reasoning>
  )
}
