import type { ToolProps } from '@tanstack/ai-react-ui'
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai/sources'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai/tool'
import type { chatOptions } from '@/chat/options'

export function LookupPlaceTool({
  part,
}: ToolProps<typeof chatOptions, 'lookupPlace'>) {
  const sources = part.output?.sources ?? []
  return (
    <div className="space-y-2">
      <Tool defaultOpen>
        <ToolHeader state={part.state} title="lookupPlace" />
        <ToolContent>
          {part.input ? <ToolInput input={part.input} /> : null}
          {part.output ? <ToolOutput output={part.output} /> : null}
        </ToolContent>
      </Tool>
      {sources.length > 0 ? (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((source) => (
              <Source href={source.url} key={source.url} title={source.title} />
            ))}
          </SourcesContent>
        </Sources>
      ) : null}
    </div>
  )
}
