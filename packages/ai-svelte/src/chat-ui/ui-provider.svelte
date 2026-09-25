<script lang="ts">
  import {
    setUIContext,
    type ChatUIComponents,
    type UIDescriptor,
  } from './create-ui'

  let {
    ui,
    chat,
    components,
    children,
  }: {
    ui: UIDescriptor
    // ponytail: Svelte components are not generic, so ChatUIHost<TOptions> cannot
    // accept a typed createChat() host with tool-approval interrupts.
    chat: any
    components?: ChatUIComponents<unknown>
    children?: import('svelte').Snippet
  } = $props()

  setUIContext({
    ui,
    chat,
    components: (components ?? ui.components) as never,
  })
</script>

{@render children?.()}
