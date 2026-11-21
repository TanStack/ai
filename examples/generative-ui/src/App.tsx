import { useState } from 'react'
import { ChatSurface } from './ChatSurface'
import { Playground } from './Playground'
import { FrameSurface } from './FrameSurface'
import { A2uiSurface } from './A2uiSurface'

type Surface = 'chat' | 'playground' | 'frame' | 'a2ui'

/**
 * Two surfaces, one deliberate default. The conversation (ChatSurface) is the
 * product — a graph is message content in a chat stream (spec §1 principle 6,
 * §15.1). The Playground is a developer test bench for the catalog, drivers,
 * and bounded repair — never the demo.
 */
export function App() {
  const [surface, setSurface] = useState<Surface>('chat')

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-6 h-12 border-b border-white/5 bg-[#070b14]/70 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center text-[11px] font-bold text-white">
            ◇
          </div>
          <span className="text-xs font-semibold text-slate-200 font-display tracking-tight">
            Open Generative UI
          </span>
          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
            Draft 0.2
          </span>
        </div>

        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/5 border border-white/5 text-xs">
          <button
            type="button"
            onClick={() => setSurface('chat')}
            className={`px-3 py-1 rounded-md transition-colors font-medium ${
              surface === 'chat'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => setSurface('playground')}
            className={`px-3 py-1 rounded-md transition-colors font-medium ${
              surface === 'playground'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Playground
            <span className="ml-1.5 text-[9px] text-slate-500 uppercase tracking-wide hidden sm:inline">
              test bench
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSurface('frame')}
            className={`px-3 py-1 rounded-md transition-colors font-medium ${
              surface === 'frame'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Frame
            <span className="ml-1.5 text-[9px] text-slate-500 uppercase tracking-wide hidden sm:inline">
              tier F
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSurface('a2ui')}
            className={`px-3 py-1 rounded-md transition-colors font-medium ${
              surface === 'a2ui'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            A2UI
            <span className="ml-1.5 text-[9px] text-slate-500 uppercase tracking-wide hidden sm:inline">
              inbound
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {surface === 'chat' ? (
          <ChatSurface />
        ) : surface === 'playground' ? (
          <Playground />
        ) : surface === 'frame' ? (
          <FrameSurface />
        ) : (
          <A2uiSurface />
        )}
      </div>
    </div>
  )
}
