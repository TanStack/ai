<script lang="ts">
  import { ChevronDown, ChevronRight } from 'lucide-svelte'

  interface Props {
    content: string
    isComplete: boolean
    class?: string
  }

  let { content, isComplete, class: className = '' }: Props = $props()

  let isExpanded = $state(false)
</script>

<div class={`${className}`}>
  <button
    onclick={() => (isExpanded = !isExpanded)}
    class="flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors w-full text-left"
  >
    {#if isExpanded}
      <ChevronDown size={16} />
    {:else}
      <ChevronRight size={16} />
    {/if}
    <span class="text-sm font-medium">
      {isComplete ? '💭 Thinking (complete)' : '💭 Thinking...'}
    </span>
  </button>

  {#if isExpanded}
    <div class="mt-2 pl-6 text-gray-400 text-sm whitespace-pre-wrap">
      {content}
    </div>
  {/if}
</div>

