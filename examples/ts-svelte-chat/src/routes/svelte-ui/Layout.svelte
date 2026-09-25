<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    chat,
    messages,
  }: {
    chat: { sendMessage: (text: string) => void | Promise<void> }
    messages?: Snippet
  } = $props()

  let draft = $state('')
</script>

<div class="flex h-[calc(100vh-72px)] flex-col overflow-hidden bg-gray-900">
  <div class="flex-1 overflow-y-auto px-4 py-4">
    {@render messages?.()}
  </div>
  <form
    class="border-t border-orange-500/20 bg-gray-800 p-4"
    onsubmit={(event) => {
      event.preventDefault()
      const text = draft.trim()
      if (!text) return
      draft = ''
      void chat.sendMessage(text)
    }}
  >
    <input
      class="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-white"
      placeholder="Ask about guitars..."
      bind:value={draft}
    />
  </form>
</div>
