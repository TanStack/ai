<script lang="ts">
  import { UIMessages, UIProvider } from '../../../src/ui'
  import { chat, components, ui } from './fixture-data'
</script>

<UIProvider {ui} {chat} {components}>
  <UIMessages {ui}>
    {#snippet children(messages)}
      <span>{messages.length}</span>
    {/snippet}
  </UIMessages>
</UIProvider>
