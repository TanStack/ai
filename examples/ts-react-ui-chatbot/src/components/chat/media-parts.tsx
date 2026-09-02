import type { PartProps } from '@tanstack/ai-react/ui'
import type { chatOptions } from '@/chat/options'

function sourceHref(source: {
  type: string
  value: string
  mimeType?: string
}): string {
  if (source.type === 'data') {
    return `data:${source.mimeType ?? 'application/octet-stream'};base64,${source.value}`
  }
  return source.value
}

export function ImagePart({ part }: PartProps<typeof chatOptions, 'image'>) {
  return (
    <img
      alt="Trip photo"
      className="max-h-64 max-w-full rounded-lg object-cover"
      src={sourceHref(part.source)}
    />
  )
}

export function AudioPart({ part }: PartProps<typeof chatOptions, 'audio'>) {
  return (
    <audio className="w-full" controls src={sourceHref(part.source)}>
      Voice note
    </audio>
  )
}

export function VideoPart({ part }: PartProps<typeof chatOptions, 'video'>) {
  return (
    <video
      className="max-h-64 max-w-full rounded-lg"
      controls
      src={sourceHref(part.source)}
    >
      Neighborhood clip
    </video>
  )
}

export function DocumentPart({
  part,
}: PartProps<typeof chatOptions, 'document'>) {
  const href = sourceHref(part.source)
  const mime = part.source.type === 'data' ? part.source.mimeType : 'document'
  return (
    <a
      className="text-sm underline"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      Trip file ({mime})
    </a>
  )
}

export function ToolResultPart({
  part,
}: PartProps<typeof chatOptions, 'toolResult'>) {
  const text = typeof part.content === 'string' ? part.content : 'Tool result'
  return <p className="text-muted-foreground text-xs">{text}</p>
}

export function UIResourcePart({
  part,
}: PartProps<typeof chatOptions, 'uiResource'>) {
  const html = part.resource.text
  return (
    <article className="rounded-xl border bg-card/80 p-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-primary">
        Map pin
      </p>
      <p className="mt-1 text-sm">{part.toolName}</p>
      {html ? (
        <iframe
          className="mt-2 h-40 w-full rounded-md border"
          sandbox=""
          srcDoc={html}
          title={part.resource.uri}
        />
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">
          {part.resource.uri}
        </p>
      )}
    </article>
  )
}
