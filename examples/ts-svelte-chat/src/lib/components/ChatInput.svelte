<script lang="ts">
  import { Send, Square } from 'lucide-svelte'

  interface Props {
    value: string
    isLoading: boolean
    onSend: (message: string) => void
    onStop: () => void
  }

  let { value = $bindable(''), isLoading, onSend, onStop }: Props = $props()

  let textarea: HTMLTextAreaElement | undefined = $state()

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement
    target.style.height = 'auto'
    target.style.height = Math.min(target.scrollHeight, 200) + 'px'
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && value.trim()) {
      e.preventDefault()
      onSend(value)
      value = ''
      if (textarea) {
        textarea.style.height = 'auto'
      }
    }
  }

  function handleSubmit() {
    if (value.trim()) {
      onSend(value)
      value = ''
      if (textarea) {
        textarea.style.height = 'auto'
      }
    }
  }
</script>

<div class="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
  <div class="w-full px-4 py-3">
    <div class="space-y-3">
      {#if isLoading}
        <div class="flex items-center justify-center">
          <button
            onclick={onStop}
            class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Square class="w-4 h-4 fill-current" />
            Stop
          </button>
        </div>
      {/if}
      <div class="relative">
        <textarea
          bind:this={textarea}
          bind:value
          oninput={handleInput}
          onkeydown={handleKeyDown}
          placeholder="Type something clever (or don't, we won't judge)..."
          class="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
          rows="1"
          style="min-height: 44px; max-height: 200px"
          disabled={isLoading}
        ></textarea>
        <button
          onclick={handleSubmit}
          disabled={!value.trim() || isLoading}
          class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
        >
          <Send class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</div>
