import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'

export function SeedImageField(props: {
  file: File | null
  onChange: (file: File | null) => void
  required: boolean
  disabled: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!props.file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(props.file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [props.file])

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.files?.[0] ?? null)
          event.target.value = ''
        }}
      />
      {preview ? (
        <div className="relative h-16 w-16 shrink-0">
          <img
            src={preview}
            alt="Seed image"
            className="h-16 w-16 rounded-lg object-cover"
          />
          <button
            type="button"
            onClick={() => props.onChange(null)}
            disabled={props.disabled}
            className="absolute -right-1 -top-1 rounded-full bg-gray-800 p-0.5 text-gray-300 hover:text-white disabled:opacity-50"
            aria-label="Remove seed image"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={props.disabled}
          className="flex h-16 w-28 flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          <span className="mt-0.5 px-1 text-center text-[10px] leading-tight">
            {props.required ? 'Seed image (required)' : 'Seed image'}
          </span>
        </button>
      )}
    </div>
  )
}
