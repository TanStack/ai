<script lang="ts">
  import UIProvider from './ui-provider.svelte'
  import UIMessages from './ui-messages.svelte'
  import UIInterrupts from './ui-interrupts.svelte'
  import type { ChatUIComponents, UIDescriptor } from './create-ui'

  let {
    ui,
    chat,
    components,
  }: {
    ui: UIDescriptor
    // ponytail: Svelte components are not generic, so ChatUIHost<TOptions> cannot
    // accept a typed createChat() host with tool-approval interrupts.
    chat: any
    components: ChatUIComponents<unknown>
  } = $props()

  const Layout = $derived(components.layout as any)
  const Input = $derived(components.input as any)
</script>

<UIProvider {ui} {chat} {components}>
  <Layout>
    {#snippet messages()}
      <UIMessages {ui} />
    {/snippet}
    {#snippet interrupts()}
      <UIInterrupts {ui} />
    {/snippet}
    {#snippet input()}
      {#if Input}
        <Input />
      {/if}
    {/snippet}
  </Layout>
</UIProvider>
