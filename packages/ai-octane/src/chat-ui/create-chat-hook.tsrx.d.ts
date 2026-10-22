import type { ComponentBody } from 'octane'
type ComponentType<P = any> = ComponentBody<P>
import type { InferredClientContext } from '@tanstack/ai-client'
import type {
  ChatUIInterruptsOf,
  ChatUISchemaOf,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type { UseChatOptions } from '../types'
import type {
  ChatUIFactoryConfig,
  ChatUIHost,
  InputProps,
} from './create-ui.tsrx'
type HeadlessOptions<TOptions> = UseChatOptions<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  InferredClientContext<ChatUIToolsOf<TOptions>>,
  ChatUIInterruptsOf<TOptions>
>
type ChatInstanceOverrides<TOptions> = {
  threadId: string
  live?: boolean
  forwardedProps?: Record<string, any>
  initialMessages?: HeadlessOptions<TOptions>['initialMessages']
}
/**
 * Bind chat options and UI widgets once at module scope.
 *
 * This matches Form `createFormHook` and Table `createTableHook`. The
 * returned `useAppChat` creates a chat instance. `chat.AppChat` renders it.
 * `useChatContext` reads that instance. Part and interrupt widgets take
 * `part` / `interrupt` as props. Do not read those from context.
 *
 * Pass `threadId` and other instance overrides into `useAppChat()`.
 *
 * @example
 * ```tsx
 * const { useAppChat, useChatContext } = createChatHook({
 *   options: chatOptions,
 *   components: { layout: ChatLayout, message: ChatMessage },
 *   partsComponents: { fallback: FallbackPart },
 *   toolsComponents: { getWeather: WeatherTool, purchaseItem: PurchaseTool },
 *   interruptsComponents: { generic: { choosePlan: ChoosePlan } },
 * })
 *
 * function Support() {
 *   const chat = useAppChat({ threadId: 'support-1' })
 *   return <chat.AppChat />
 * }
 * ```
 */
export declare function createChatHook<
  const TOptions,
  TInput extends ComponentType<any> | undefined =
    | ComponentType<InputProps<NoInfer<TOptions>>>
    | undefined,
>({
  options,
  ...chatComponents
}: {
  options: TOptions
} & ChatUIFactoryConfig<NoInfer<TOptions>, TInput>): {
  useAppChat: (
    overrides: ChatInstanceOverrides<TOptions>,
  ) => ChatUIHost<TOptions> & {
    AppChat: ComponentType
  }
  useChatContext: () => ChatUIHost<TOptions>
}
