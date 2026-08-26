<script lang="ts">
  import UIProvider from './ui-provider.svelte'
  import UIMessages from './ui-messages.svelte'
  import UIInterrupts from './ui-interrupts.svelte'
  import type { ChatUIHost, UIDescriptor } from './create-ui'

  let {
    ui,
    chat,
    components,
  }: {
    ui: UIDescriptor
    chat: ChatUIHost
    components: any
  } = $props()

  const Layout = $derived(components.layout as any)
  const Input = $derived(components.input as any)
</script>

<UIProvider {ui} {chat} {components}>
  <Layout {chat}>
    {#snippet messages()}
      <UIMessages {ui} />
    {/snippet}
    {#snippet interrupts()}
      <UIInterrupts {ui} />
    {/snippet}
    {#snippet input()}
      {#if Input}
        <Input {chat} />
      {/if}
    {/snippet}
  </Layout>
</UIProvider>
