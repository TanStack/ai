export function AudioPlayer({ src }: { src: string }) {
  return (
    <div className="p-4">
      <audio
        data-testid="audio-player"
        controls
        src={src}
        className="w-full max-w-md"
      />
    </div>
  )
}
