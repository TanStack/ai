import { useState } from 'react'
import { HelpCircle, Check, X, ChevronRight, Trophy, RotateCcw, BookOpen } from 'lucide-react'
import type { TriviaSet } from '@/lib/structured-output-types'

interface TriviaRendererProps {
  data: TriviaSet
}

export default function TriviaRenderer({ data }: TriviaRendererProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [score, setScore] = useState(0)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set())

  const question = data.questions[currentQuestion]
  const isAnswered = answeredQuestions.has(currentQuestion)
  const isCorrect = selectedAnswer === question.correctAnswer
  const allAnswered = answeredQuestions.size === data.questions.length

  const handleAnswer = (index: number) => {
    if (isAnswered) return
    
    setSelectedAnswer(index)
    setShowExplanation(true)
    setAnsweredQuestions(prev => new Set(prev).add(currentQuestion))
    
    if (index === question.correctAnswer) {
      setScore(prev => prev + 1)
    }
  }

  const nextQuestion = () => {
    if (currentQuestion < data.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1)
      setSelectedAnswer(null)
      setShowExplanation(false)
    }
  }

  const resetQuiz = () => {
    setCurrentQuestion(0)
    setSelectedAnswer(null)
    setShowExplanation(false)
    setScore(0)
    setAnsweredQuestions(new Set())
  }

  const difficultyColors = {
    easy: 'from-green-600 to-emerald-600',
    medium: 'from-yellow-600 to-orange-600',
    hard: 'from-red-600 to-pink-600',
  }

  return (
    <div className="bg-gradient-to-br from-indigo-950 via-violet-950 to-purple-950 rounded-2xl overflow-hidden border border-indigo-500/30 shadow-2xl">
      {/* Header */}
      <div className="relative bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6 overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyIiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvZz48L3N2Zz4=')] opacity-50" />
        
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-6 h-6 text-indigo-200" />
              <span className="text-indigo-100 font-medium">{data.category}</span>
            </div>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold text-white bg-gradient-to-r ${difficultyColors[data.difficulty]}`}>
              {data.difficulty.charAt(0).toUpperCase() + data.difficulty.slice(1)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-white">{score}/{data.questions.length}</div>
            <div className="text-indigo-200 text-sm">Score</div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4 bg-indigo-950/50 border-b border-indigo-500/20">
        <div className="flex gap-1">
          {data.questions.map((_, index) => (
            <div
              key={index}
              className={`flex-1 h-2 rounded-full transition-all ${
                index === currentQuestion
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500'
                  : answeredQuestions.has(index)
                    ? 'bg-violet-500/50'
                    : 'bg-indigo-900/50'
              }`}
            />
          ))}
        </div>
        <div className="text-center text-indigo-300 text-sm mt-2">
          Question {currentQuestion + 1} of {data.questions.length}
        </div>
      </div>

      {/* Question Card */}
      {!allAnswered ? (
        <div className="p-6">
          <div className="bg-indigo-900/30 rounded-xl p-6 border border-indigo-500/20 mb-6">
            <h2 className="text-xl font-bold text-white leading-relaxed">
              {question.question}
            </h2>
          </div>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {question.options.map((option, index) => {
              let buttonStyle = 'bg-indigo-900/30 border-indigo-500/20 hover:border-indigo-400/50 text-white'
              
              if (isAnswered) {
                if (index === question.correctAnswer) {
                  buttonStyle = 'bg-green-500/20 border-green-500/50 text-green-300'
                } else if (index === selectedAnswer) {
                  buttonStyle = 'bg-red-500/20 border-red-500/50 text-red-300'
                } else {
                  buttonStyle = 'bg-indigo-900/20 border-indigo-500/10 text-indigo-400'
                }
              }

              return (
                <button
                  key={index}
                  onClick={() => handleAnswer(index)}
                  disabled={isAnswered}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-center gap-4 ${buttonStyle} ${!isAnswered ? 'hover:scale-[1.02] cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center font-bold text-sm flex-shrink-0">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="flex-1">{option}</span>
                  {isAnswered && index === question.correctAnswer && (
                    <Check className="w-6 h-6 text-green-400" />
                  )}
                  {isAnswered && index === selectedAnswer && index !== question.correctAnswer && (
                    <X className="w-6 h-6 text-red-400" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Explanation */}
          {showExplanation && (
            <div className={`rounded-xl p-5 border mb-6 ${
              isCorrect 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${isCorrect ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  {isCorrect ? (
                    <Check className="w-5 h-5 text-green-400" />
                  ) : (
                    <X className="w-5 h-5 text-red-400" />
                  )}
                </div>
                <div>
                  <h4 className={`font-bold mb-1 ${isCorrect ? 'text-green-300' : 'text-red-300'}`}>
                    {isCorrect ? 'Correct!' : 'Not quite!'}
                  </h4>
                  <p className="text-slate-300 text-sm mb-2">{question.explanation}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <BookOpen size={14} />
                    <span>Source: {question.source}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Next Button */}
          {isAnswered && currentQuestion < data.questions.length - 1 && (
            <button
              onClick={nextQuestion}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-2"
            >
              Next Question
              <ChevronRight size={20} />
            </button>
          )}
        </div>
      ) : (
        /* Final Score Screen */
        <div className="p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Quiz Complete!</h2>
          <p className="text-indigo-300 text-lg mb-6">
            You scored {score} out of {data.questions.length}
          </p>
          <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 mb-8">
            {Math.round((score / data.questions.length) * 100)}%
          </div>
          <button
            onClick={resetQuiz}
            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl hover:from-indigo-500 hover:to-violet-500 transition-all inline-flex items-center gap-2"
          >
            <RotateCcw size={20} />
            Try Again
          </button>
        </div>
      )}
    </div>
  )
}

