import { UI } from '@/chat/options'
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

export const components = UI.defineComponents({
  layout: ChatLayout,
  message: ChatMessage,
  input: ChatPromptInput,
  parts: {
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
  tools: {
    lookupPlace: LookupPlaceTool,
    bookStay: BookStayTool,
    confirmPayment: ConfirmPaymentTool,
  },
  interrupts: {
    tools: {
      bookStay: BookStayApproval,
    },
    generic: {
      chooseBudget: ChooseBudget,
      fallback: FallbackInterrupt,
    },
  },
})
