import Chat from './chat.vue'
import ChatInput from './chat-input.vue'
import ChatMessage from './chat-message.vue'
import ChatMessages from './chat-messages.vue'
import ThinkingPart from './thinking-part.vue'
import TextPart from './text-part.vue'
import ToolApproval from './tool-approval.vue'

export {
  createChatUI,
  UIChat,
  UIProvider,
  UIMessages,
  UIMessage,
  UIPart,
  UIInterrupts,
  UIInterrupt,
  type ChatUIComponents,
  type ChatUIHost,
  type InputProps,
  type InterruptProps,
  type LayoutProps,
  type MessageProps,
  type PartProps,
  type ToolProps,
  type UIDescriptor,
} from './create-ui'

export {
  Chat,
  ChatInput,
  ChatMessage,
  ChatMessages,
  ThinkingPart,
  TextPart,
  ToolApproval,
}

export type {
  ChatProps,
  ChatInputProps,
  ChatInputRenderProps,
  ChatMessageProps,
  ChatMessagesProps,
  ThinkingPartProps,
  TextPartProps,
  ToolApprovalProps,
  ToolApprovalRenderProps,
  ToolCallRenderProps,
} from './types'
