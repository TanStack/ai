import { Mic, Volume2, Activity, Square } from 'lucide-react'

interface MonitorStatusProps {
  active: boolean
  plugins: string[]
  onStop: () => void
}

export function MonitorStatus({ active, plugins, onStop }: MonitorStatusProps) {
  if (!active) {
    return null
  }

  return (
    <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-300 font-medium text-sm">Live Monitoring Active</span>
        </div>
        <button
          onClick={onStop}
          className="flex items-center gap-1 px-3 py-1 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
        >
          <Square className="w-3 h-3" />
          Stop
        </button>
      </div>
      
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <Mic className="w-4 h-4 text-cyan-400" />
        <span>Mic</span>
        
        {plugins.map((plugin) => (
          <span key={plugin} className="flex items-center gap-2">
            <span className="text-gray-600">→</span>
            <Activity className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300">{plugin}</span>
          </span>
        ))}
        
        <span className="text-gray-600">→</span>
        <Volume2 className="w-4 h-4 text-green-400" />
        <span>Speakers</span>
      </div>
    </div>
  )
}

