export function TranscriptionDisplay({ text }: { text: string }) {
  return (
    <div className="p-4">
      <div
        data-testid="transcription-result"
        className="p-3 bg-gray-800/50 border border-gray-700 rounded text-sm"
      >
        {text}
      </div>
    </div>
  )
}
