<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { marked } from 'marked'
  import { markedHighlight } from 'marked-highlight'
  import hljs from 'highlight.js'
  import type { UIMessage } from '@tanstack/ai-svelte'
  import GuitarRecommendation from './GuitarRecommendation.svelte'
  import ThinkingPart from './ThinkingPart.svelte'

  interface Props {
    messages: Array<UIMessage>
    addToolApprovalResponse: (response: {
      id: string
      approved: boolean
    }) => Promise<void>
  }

  let { messages, addToolApprovalResponse }: Props = $props()

  let messagesContainer: HTMLDivElement | undefined = $state()

  // Configure marked with syntax highlighting
  marked.use(
    markedHighlight({
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext'
        return hljs.highlight(code, { language }).value
      },
    }),
  )

  // Auto-scroll when messages change
  $effect(() => {
    if (messagesContainer && messages.length > 0) {
      tick().then(() => {
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight
        }
      })
    }
  })

  function renderMarkdown(content: string): string {
    return marked.parse(content, { async: false }) as string
  }
</script>

{#if messages.length > 0}
  <div bind:this={messagesContainer} class="flex-1 overflow-y-auto px-4 py-4">
    {#each messages as message (message.id)}
      <div
        class={`p-4 rounded-lg mb-2 ${
          message.role === 'assistant'
            ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
            : 'bg-transparent'
        }`}
      >
        <div class="flex items-start gap-4">
          {#if message.role === 'assistant'}
            <div
              class="w-8 h-8 rounded-lg bg-linear-to-r from-orange-500 to-red-600 flex items-center justify-center text-sm font-medium text-white shrink-0"
            >
              AI
            </div>
          {:else}
            <div
              class="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0"
            >
              U
            </div>
          {/if}
          <div class="flex-1 min-w-0">
            <!-- Render parts in order -->
            {#each message.parts as part, index}
              {#if part.type === 'thinking'}
                <!-- Check if thinking is complete (if there's a text part after) -->
                {@const isComplete = message.parts
                  .slice(index + 1)
                  .some((p) => p.type === 'text')}
                <div class="mt-2 mb-2">
                  <ThinkingPart
                    content={part.content}
                    {isComplete}
                    class="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg"
                  />
                </div>
              {:else if part.type === 'text' && part.content}
                <div class="text-white prose dark:prose-invert max-w-none">
                  {@html renderMarkdown(part.content)}
                </div>
              {:else if part.type === 'tool-call' && part.state === 'approval-requested' && part.approval}
                <div
                  class="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-2"
                >
                  <p class="text-white font-medium mb-2">
                    🔒 Approval Required: {part.name}
                  </p>
                  <div class="text-gray-300 text-sm mb-3">
                    <pre
                      class="bg-gray-800 p-2 rounded text-xs overflow-x-auto">{JSON.stringify(
                        JSON.parse(part.arguments),
                        null,
                        2,
                      )}</pre>
                  </div>
                  <div class="flex gap-2">
                    <button
                      onclick={() =>
                        addToolApprovalResponse({
                          id: part.approval!.id,
                          approved: true,
                        })}
                      class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onclick={() =>
                        addToolApprovalResponse({
                          id: part.approval!.id,
                          approved: false,
                        })}
                      class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      ✗ Deny
                    </button>
                  </div>
                </div>
              {:else if part.type === 'tool-call' && part.name === 'recommendGuitar' && part.output}
                <div class="mt-2">
                  <GuitarRecommendation id={part.output?.id} />
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
    {/each}
  </div>
{/if}
