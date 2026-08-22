import { useState, useEffect } from 'react'
import { getTickerScore } from '../scoring/scoreCache'
import { actionShortLabel, actionStyle, pillarColor } from '../scoring/actionStyles'

function Pillar({ label, score, detail }) {
  return (
    <div className="flex-1 bg-white dark:bg-gray-900 rounded-lg px-3 py-2 text-center" title={detail || undefined}>
      <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${pillarColor(score)}`}>
        {score == null ? '—' : `${score > 0 ? '+' : ''}${score}`}
      </p>
    </div>
  )
}

function FlagList({ label, items, tone }) {
  if (!items?.length) return null
  return (
    <p className="text-xs leading-relaxed">
      <span className={`font-semibold ${tone}`}>{label}: </span>
      <span className="text-gray-500 dark:text-gray-400">{items.join('; ')}</span>
    </p>
  )
}

export default function ScoreCard({ symbol }) {
  const [card, setCard] = useState(undefined)

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setCard(undefined)
    getTickerScore(symbol).then((c) => { if (!cancelled) setCard(c) })
    return () => { cancelled = true }
  }, [symbol])

  if (card === undefined) {
    return (
      <div className="border-t border-gray-100 dark:border-gray-800 pt-4 h-24 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-800 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!card) {
    return (
      <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Technical Score</h3>
        <p className="text-xs text-gray-400 dark:text-gray-600">Not enough price history to score this symbol.</p>
      </div>
    )
  }

  const { pillars, pillar_total, decision, warning } = card

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Technical Score</h3>
        <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
          Total {pillar_total > 0 ? '+' : ''}{pillar_total} <span className="text-gray-300 dark:text-gray-700">(-6..+6)</span>
        </span>
      </div>

      <div className="flex gap-2">
        <Pillar label="Trend" score={pillars.trend.score} detail={pillars.trend.detail} />
        <Pillar label="Momentum" score={pillars.momentum.score} detail={pillars.momentum.detail} />
        <Pillar label="Macro" score={pillars.macro_sentiment.score} detail={pillars.macro_sentiment.detail} />
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold whitespace-nowrap ${actionStyle(decision.action)}`}>
            {actionShortLabel(decision.action)}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{decision.rationale}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{decision.framing}</p>
        <FlagList label="Exhaustion" items={decision.flags.exhaustion} tone="text-amber-600 dark:text-amber-400" />
        <FlagList label="Bearish" items={decision.flags.bearish} tone="text-red-600 dark:text-red-400" />
        <FlagList label="Rebound" items={decision.flags.rebound} tone="text-emerald-600 dark:text-emerald-400" />
        {decision.flags.death_cross && (
          <p className="text-xs text-gray-400 dark:text-gray-600">Structure: active death-cross (EMA50&lt;EMA200, price&lt;EMA50)</p>
        )}
      </div>

      {warning && <p className="text-xs text-gray-300 dark:text-gray-700">⚠ {warning}</p>}
    </div>
  )
}
