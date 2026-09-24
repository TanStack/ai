import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'

export function SeedImageField(props: {
  files: Array<File>
  onChange: (files: Array<File>) => void
  maxFiles?: number
  required: boolean
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = useState<Array<string>>([])
  const maxFiles = props.maxFiles ?? 1
  const remaining = maxFiles - props.files.length

  useEffect(() => {
    const urls = props.files.map((file) => URL.createObjectURL(file))
    setPreviews(urls)
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [props.files])

  const label =
    maxFiles > 1
      ? props.required
        ? `Seed photos (required, max ${maxFiles})`
        : `Seed photos (max ${maxFiles})`
      : props.required
        ? 'Seed image (required)'
        : 'Seed image'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={maxFiles > 1}
        className="hidden"
        disabled={props.disabled || remaining <= 0}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (picked.length === 0) return
          props.onChange([...props.files, ...picked].slice(0, maxFiles))
        }}
      />
      {previews.map((src, index) => (
        <div key={`${src}-${index}`} className="relative h-16 w-16 shrink-0">
          <img
            src={src}
            alt={`Seed image ${index + 1}`}
            className="h-16 w-16 rounded-lg object-cover"
          />
          <button
            type="button"
            onClick={() =>
              props.onChange(props.files.filter((_, i) => i !== index))
            }
            disabled={props.disabled}
            className="absolute -top-1 -right-1 rounded-full bg-gray-800 p-0.5 text-gray-300 hover:text-white disabled:opacity-50"
            aria-label={`Remove seed image ${index + 1}`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={props.disabled}
          className="flex h-16 w-28 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          <span className="mt-0.5 px-1 text-center text-[10px] leading-tight">
            {label}
          </span>
        </button>
      ) : null}
    </div>
  )
}
