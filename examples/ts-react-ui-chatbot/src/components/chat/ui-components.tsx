import { createChatHook } from '@tanstack/ai-react/ui'
import { chatOptions } from '@/chat/options'
import { chatContext, interruptContext, partContext } from '@/chat/ui-context'
import { BookStayApproval, BookStayTool } from './book-stay-tool'
import { ConfirmPaymentTool } from './confirm-payment-tool'
import { ChatPromptInput } from './input'
import { ChatLayout } from './layout'
import { ChooseBudget } from './choose-budget'
import { FallbackInterrupt } from './fallback-interrupt'
import { FallbackPart } from './fallback-part'
import { LookupPlaceTool } from './lookup-place-tool'
import {
  AudioPart,
  DocumentPart,
  ImagePart,
  ToolResultPart,
  UIResourcePart,
  VideoPart,
} from './media-parts'
import { ChatMessage } from './message'
import { StructuredOutputPart } from './structured-output'
import { TextPart } from './text-part'
import { ThinkingPart } from './thinking-part'

export const { useAppChat, useChatContext } = createChatHook({
  options: chatOptions,
  context: {
    chatContext,
    partContext,
    interruptContext,
  },
  components: {
    layout: ChatLayout,
    message: ChatMessage,
    input: ChatPromptInput,
  },
  partsComponents: {
    text: TextPart,
    thinking: ThinkingPart,
    structuredOutput: StructuredOutputPart,
    image: ImagePart,
    audio: AudioPart,
    video: VideoPart,
    document: DocumentPart,
    toolResult: ToolResultPart,
    uiResource: UIResourcePart,
    fallback: FallbackPart,
  },
  toolsComponents: {
    lookupPlace: LookupPlaceTool,
    bookStay: BookStayTool,
    confirmPayment: ConfirmPaymentTool,
  },
  interruptsComponents: {
    tools: {
      bookStay: BookStayApproval,
    },
    generic: {
      chooseBudget: ChooseBudget,
      fallback: FallbackInterrupt,
    },
  },
})
