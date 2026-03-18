import { useState } from 'react'
import {
  Music,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Shuffle,
  Repeat,
  Volume2,
} from 'lucide-react'
import type { CountrySong } from '@/lib/structured-output-types'

interface CountrySongRendererProps {
  data: CountrySong
}

export default function CountrySongRenderer({
  data,
}: CountrySongRendererProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [activeSection, setActiveSection] = useState<
    'verse1' | 'chorus' | 'verse2' | 'bridge' | 'outro'
  >('verse1')

  const sections = [
    { id: 'verse1', label: 'Verse 1', content: data.verse1 },
    { id: 'chorus', label: 'Chorus', content: data.chorus },
    { id: 'verse2', label: 'Verse 2', content: data.verse2 },
    { id: 'bridge', label: 'Bridge', content: data.bridge },
    { id: 'outro', label: 'Outro', content: data.outro },
  ] as const

  return (
    <div className="bg-gradient-to-br from-amber-950 via-orange-950 to-stone-950 rounded-2xl overflow-hidden border border-amber-700/30 shadow-2xl">
      {/* Album Art Header */}
      <div className="relative aspect-square max-h-80 bg-gradient-to-br from-amber-800 via-orange-700 to-stone-800 overflow-hidden">
        {/* Vinyl Record Effect */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className={`w-64 h-64 rounded-full bg-gradient-to-br from-stone-900 to-stone-800 shadow-2xl flex items-center justify-center ${isPlaying ? 'animate-spin' : ''}`}
            style={{ animationDuration: '3s' }}
          >
            <div className="w-48 h-48 rounded-full bg-gradient-to-br from-stone-800 to-stone-700 flex items-center justify-center">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-stone-900" />
              </div>
            </div>
          </div>
        </div>

        {/* Overlay Info */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-stone-900 via-stone-900/80 to-transparent p-6">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-2">
            <Music size={14} />
            <span>{data.album}</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">{data.title}</h1>
          <p className="text-amber-300">{data.artist}</p>
        </div>
      </div>

      {/* Spotify-style Player */}
      <div className="px-6 py-4 bg-stone-900/50 border-b border-stone-800">
        {/* Progress Bar */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-stone-400">0:00</span>
          <div className="flex-1 h-1 bg-stone-700 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
          </div>
          <span className="text-xs text-stone-400">3:42</span>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <button className="text-stone-400 hover:text-white transition-colors">
            <Shuffle size={20} />
          </button>
          <button className="text-stone-400 hover:text-white transition-colors">
            <SkipBack size={24} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white hover:scale-105 transition-transform shadow-lg"
          >
            {isPlaying ? (
              <Pause size={24} />
            ) : (
              <Play size={24} className="ml-1" />
            )}
          </button>
          <button className="text-stone-400 hover:text-white transition-colors">
            <SkipForward size={24} />
          </button>
          <button className="text-stone-400 hover:text-white transition-colors">
            <Repeat size={20} />
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center justify-end gap-2 mt-4">
          <Volume2 size={16} className="text-stone-400" />
          <div className="w-24 h-1 bg-stone-700 rounded-full overflow-hidden">
            <div className="h-full w-2/3 bg-stone-400 rounded-full" />
          </div>
        </div>
      </div>

      {/* Song Details */}
      <div className="px-6 py-4 flex items-center gap-6 border-b border-stone-800/50">
        <div className="flex items-center gap-4">
          <button className="text-stone-400 hover:text-pink-400 transition-colors">
            <Heart size={24} />
          </button>
        </div>
        <div className="flex gap-4 text-sm">
          <span className="px-3 py-1 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
            {data.key}
          </span>
          <span className="px-3 py-1 bg-stone-800 text-stone-300 rounded-full border border-stone-700">
            {data.tempo}
          </span>
        </div>
      </div>

      {/* Section Navigator */}
      <div className="px-6 py-4">
        <div className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                activeSection === section.id
                  ? 'bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-lg'
                  : 'bg-stone-800/50 text-stone-400 hover:bg-stone-800 hover:text-stone-200'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lyrics Display */}
      <div className="px-6 pb-6">
        {sections.map((section) => (
          <div
            key={section.id}
            className={`transition-all duration-300 ${
              activeSection === section.id ? 'opacity-100' : 'hidden opacity-0'
            }`}
          >
            <div className="bg-stone-900/50 rounded-xl p-6 border border-stone-800">
              <h3 className="text-amber-400 font-bold mb-4 text-sm uppercase tracking-wider">
                {section.label}
              </h3>
              <p className="text-white text-lg leading-relaxed whitespace-pre-line font-serif italic">
                {section.content}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Spotify Description */}
      <div className="px-6 pb-8">
        <div className="bg-gradient-to-r from-stone-800/50 to-amber-900/20 rounded-xl p-5 border border-stone-700/50">
          <h3 className="text-stone-400 font-medium mb-2 text-sm uppercase tracking-wider">
            About this track
          </h3>
          <p className="text-stone-300 leading-relaxed">
            {data.spotifyDescription}
          </p>
        </div>
      </div>
    </div>
  )
}
