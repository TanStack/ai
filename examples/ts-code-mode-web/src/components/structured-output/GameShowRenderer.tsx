import { Trophy, Mic, Zap, Gift, Star, Volume2 } from 'lucide-react'
import type { GameShowPitch } from '@/lib/structured-output-types'

interface GameShowRendererProps {
  data: GameShowPitch
}

export default function GameShowRenderer({ data }: GameShowRendererProps) {
  return (
    <div className="bg-gradient-to-br from-yellow-950 via-orange-950 to-red-950 rounded-2xl overflow-hidden border border-yellow-500/30 shadow-2xl">
      {/* Flashy Header */}
      <div className="relative bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 p-8 overflow-hidden">
        {/* Spotlight Effects */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-white to-transparent transform -skew-x-12" />
          <div className="absolute top-0 right-1/4 w-32 h-full bg-gradient-to-b from-white to-transparent transform skew-x-12" />
        </div>

        {/* Animated Stars */}
        <div className="absolute inset-0">
          {[...Array(8)].map((_, i) => (
            <Star
              key={i}
              className="absolute text-yellow-200 animate-pulse"
              size={20}
              style={{
                left: `${10 + i * 12}%`,
                top: `${Math.random() * 60 + 20}%`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>

        <div className="relative text-center">
          <div className="inline-flex items-center gap-2 bg-black/30 backdrop-blur-sm px-4 py-2 rounded-full mb-4">
            <Mic className="w-5 h-5 text-yellow-200" />
            <span className="text-yellow-100 font-bold text-sm uppercase tracking-wider">
              New Show Pitch
            </span>
          </div>
          <h1 className="text-5xl font-black text-white mb-3 drop-shadow-lg tracking-tight" style={{ textShadow: '3px 3px 0 rgba(0,0,0,0.3)' }}>
            {data.title}
          </h1>
          <p className="text-xl text-yellow-100 font-medium italic">
            "{data.tagline}"
          </p>
        </div>
      </div>

      {/* Format & Host */}
      <div className="px-6 py-6 grid md:grid-cols-2 gap-4">
        <div className="bg-slate-900/50 rounded-xl p-5 border border-yellow-500/20">
          <h3 className="text-yellow-400 font-bold mb-2 flex items-center gap-2">
            <Zap size={18} />
            Show Format
          </h3>
          <p className="text-slate-300 text-sm leading-relaxed">{data.format}</p>
        </div>
        <div className="bg-slate-900/50 rounded-xl p-5 border border-orange-500/20">
          <h3 className="text-orange-400 font-bold mb-2 flex items-center gap-2">
            <Mic size={18} />
            Host Style
          </h3>
          <p className="text-slate-300 text-sm leading-relaxed">{data.hostStyle}</p>
        </div>
      </div>

      {/* Rounds */}
      <div className="px-6 pb-6">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <Trophy className="text-yellow-400" />
          Game Rounds
        </h2>
        <div className="space-y-3">
          {data.rounds.map((round, index) => (
            <div
              key={index}
              className="group bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-5 border border-yellow-500/10 hover:border-yellow-500/30 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center font-bold text-white text-lg flex-shrink-0">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg mb-1">{round.name}</h3>
                    <p className="text-slate-400 text-sm">{round.description}</p>
                  </div>
                </div>
                <div className="bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20 flex-shrink-0">
                  <span className="text-yellow-400 font-bold">{round.points}</span>
                  <span className="text-yellow-400/70 text-sm ml-1">pts</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prizes */}
      <div className="px-6 pb-6">
        <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
          <Gift className="text-pink-400" />
          Prizes
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-yellow-600/20 to-amber-600/20 rounded-xl p-5 border border-yellow-500/30">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="text-yellow-400" size={24} />
              <span className="text-yellow-300 font-bold uppercase text-sm tracking-wider">Grand Prize</span>
            </div>
            <p className="text-white font-medium">{data.prizes.grand}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
            <div className="flex items-center gap-2 mb-2">
              <Gift className="text-slate-400" size={24} />
              <span className="text-slate-400 font-bold uppercase text-sm tracking-wider">Consolation</span>
            </div>
            <p className="text-slate-300 font-medium">{data.prizes.consolation}</p>
          </div>
        </div>
      </div>

      {/* Catchphrases */}
      <div className="px-6 pb-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Volume2 className="text-orange-400" />
          Catchphrases
        </h2>
        <div className="flex flex-wrap gap-2">
          {data.catchphrases.map((phrase, index) => (
            <span
              key={index}
              className="px-4 py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-full border border-orange-500/30 text-orange-200 font-medium text-sm hover:scale-105 transition-transform cursor-default"
            >
              "{phrase}"
            </span>
          ))}
        </div>
      </div>

      {/* Pilot Episode */}
      <div className="px-6 pb-8">
        <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 rounded-xl p-6 border border-red-500/30">
          <h3 className="text-red-300 font-bold mb-2 text-sm uppercase tracking-wider flex items-center gap-2">
            <Star className="w-4 h-4" />
            Pilot Episode Theme
          </h3>
          <p className="text-white text-lg font-medium">{data.pilotEpisodeTheme}</p>
        </div>
      </div>
    </div>
  )
}

