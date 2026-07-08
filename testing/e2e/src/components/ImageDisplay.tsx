export function ImageDisplay({ src, alt }: { src: string; alt?: string }) {
  return (
    <div className="p-4">
      <img
        data-testid="generated-image"
        src={src}
        alt={alt || 'Generated image'}
        className="max-w-md rounded border border-gray-700"
      />
    </div>
  )
}
