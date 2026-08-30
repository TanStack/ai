<script lang="ts">
  import UIProvider from './ui-provider.svelte'
  import UIMessages from './ui-messages.svelte'
  import UIInterrupts from './ui-interrupts.svelte'
  import { createDescriptor, type ChatUIComponents } from './create-ui'

  let {
    chat,
    components,
  }: {
    chat: any
    components: ChatUIComponents<unknown>
  } = $props()

  const ui = createDescriptor(components)
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
