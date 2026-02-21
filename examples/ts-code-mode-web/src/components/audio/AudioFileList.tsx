import { Play, Trash2, Music } from 'lucide-react'

interface AudioFile {
  id: string
  name: string
  duration: number
  sampleRate: number
}

interface AudioFileListProps {
  files: AudioFile[]
  onPlay: (name: string) => void
  onDelete: (name: string) => void
  playingName?: string
}

export function AudioFileList({ files, onPlay, onDelete, playingName }: AudioFileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No audio files yet</p>
        <p className="text-xs mt-1">Upload or record audio to get started</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-cyan-500/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Music className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{file.name}</p>
              <p className="text-xs text-gray-500">
                {file.duration.toFixed(2)}s • {(file.sampleRate / 1000).toFixed(1)}kHz
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPlay(file.name)}
              disabled={playingName === file.name}
              className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Play"
            >
              {playingName === file.name ? (
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => onDelete(file.name)}
              className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

