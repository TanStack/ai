import { CompassIcon } from 'lucide-react'
import type { LayoutProps } from '@tanstack/ai-react/ui'
import type { ContentPart } from '@tanstack/ai/client'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai/conversation'
import { Suggestion, Suggestions } from '@/components/ai/suggestions'
import type { chatOptions } from '@/chat/options'
import { useChatContext } from './ui-components'

const LISBON_PHOTO =
  'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80'

const PROMPTS: Array<{ label: string; content?: Array<ContentPart> }> = [
  { label: 'Plan 3 days in Lisbon on a comfort budget' },
  { label: 'Look up the weather in Kyoto' },
  { label: 'Book 2 nights in Reykjavik' },
  { label: 'Hold a $240 payment for Lisbon' },
  {
    label: 'What city is this photo?',
    content: [
      {
        type: 'text',
        content: 'What city is this photo? Plan a short stay.',
      },
      {
        type: 'image',
        source: { type: 'url', value: LISBON_PHOTO },
      },
    ],
  },
]

export function ChatLayout({
  Messages,
  Interrupts,
  Input,
}: LayoutProps<typeof chatOptions>) {
  const chat = useChatContext()
  if (chat.error) {
    return <p className="p-6 text-sm text-destructive">{chat.error.message}</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0">
        <ConversationContent>
          {chat.messages.length === 0 ? (
            <ConversationEmptyState
              description="Attach a street photo or a PDF, speak a plan, or ask for a city lookup."
              icon={<CompassIcon className="size-6" />}
              title="Trip desk"
            />
          ) : (
            <Messages />
          )}
          <Interrupts />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="space-y-3 p-4">
        {chat.messages.length === 0 ? (
          <Suggestions>
            {PROMPTS.map((prompt) => (
              <Suggestion
                key={prompt.label}
                onSuggestionClick={() => {
                  if (prompt.content) {
                    void chat.sendMessage({ content: prompt.content })
                    return
                  }
                  void chat.sendMessage(prompt.label)
                }}
                suggestion={prompt.label}
              />
            ))}
          </Suggestions>
        ) : null}
        <Input />
      </div>
    </div>
  )
}
