import { useState } from 'react'
import { Rocket, User, ChevronRight, Sparkles, Quote } from 'lucide-react'
import type { SciFiStory } from '@/lib/structured-output-types'

interface SciFiStoryRendererProps {
  data: SciFiStory
}

export default function SciFiStoryRenderer({ data }: SciFiStoryRendererProps) {
  const [activeAct, setActiveAct] = useState<1 | 2 | 3>(1)

  const acts = [
    { num: 1, data: data.act1 },
    { num: 2, data: data.act2 },
    { num: 3, data: data.act3 },
  ] as const

  return (
    <div className="bg-gradient-to-br from-slate-950 via-purple-950/30 to-slate-950 rounded-2xl overflow-hidden border border-purple-500/20 shadow-2xl">
      {/* Starfield Header */}
      <div className="relative h-64 bg-gradient-to-b from-indigo-950 via-purple-950 to-slate-950 overflow-hidden">
        {/* Animated Stars */}
        <div className="absolute inset-0">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                opacity: Math.random() * 0.8 + 0.2,
              }}
            />
          ))}
        </div>
        
        {/* Title */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <Rocket className="w-12 h-12 text-purple-400 mb-4 animate-bounce" />
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 mb-2 tracking-wider" style={{ fontFamily: 'system-ui' }}>
            {data.title}
          </h1>
          <p className="text-purple-300/70 text-sm italic max-w-lg">
            {data.setting}
          </p>
        </div>
      </div>

      {/* Characters */}
      <div className="px-6 -mt-8 relative z-10">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-purple-500/30">
          {data.characters.map((character, index) => (
            <div
              key={index}
              className="flex-shrink-0 w-48 bg-slate-900/90 backdrop-blur-sm rounded-xl p-4 border border-purple-500/30 hover:border-purple-400/50 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-3">
                <User className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-white font-bold mb-1">{character.name}</h3>
              <p className="text-purple-400 text-xs font-medium mb-2">{character.role}</p>
              <p className="text-slate-400 text-xs line-clamp-3">{character.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Act Navigation */}
      <div className="px-6 py-4">
        <div className="flex gap-2">
          {acts.map(({ num }) => (
            <button
              key={num}
              onClick={() => setActiveAct(num as 1 | 2 | 3)}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                activeAct === num
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                  : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              Act {num}
            </button>
          ))}
        </div>
      </div>

      {/* Active Act Content */}
      <div className="px-6 pb-6">
        {acts.map(({ num, data: actData }) => (
          <div
            key={num}
            className={`transition-all duration-300 ${
              activeAct === num ? 'opacity-100' : 'hidden opacity-0'
            }`}
          >
            <div className="bg-slate-900/50 rounded-xl p-6 border border-purple-500/20">
              <div className="flex items-center gap-3 mb-4">
                <ChevronRight className="w-5 h-5 text-purple-400" />
                <h2 className="text-xl font-bold text-white">{actData.title}</h2>
              </div>
              <p className="text-slate-300 leading-relaxed whitespace-pre-line">
                {actData.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Moral */}
      <div className="px-6 pb-8">
        <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 rounded-xl p-6 border border-purple-500/30">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-purple-300 font-medium mb-2 text-sm uppercase tracking-wider">
                The Moral
              </h3>
              <p className="text-white text-lg italic flex items-start gap-2">
                <Quote className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                {data.moral}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

