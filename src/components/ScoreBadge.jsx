import { useState, useEffect } from 'react'
import { getTickerScore } from '../scoring/scoreCache'
import { actionShortLabel, actionStyle } from '../scoring/actionStyles'

// `holding`: true | false | null — pass true for symbols actually held (e.g.
// Portfolio), since the decision cascade frames exits vs. entries differently.
export default function ScoreBadge({ symbol, holding = null }) {
  const [card, setCard] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    setCard(undefined)
    getTickerScore(symbol, { holding }).then((c) => { if (!cancelled) setCard(c) })
    return () => { cancelled = true }
  }, [symbol, holding])

  if (card === undefined) return <span className="text-gray-300 dark:text-gray-700 text-xs">…</span>
  if (!card) return <span className="text-gray-300 dark:text-gray-700 text-xs">—</span>

  const { decision, pillar_total } = card
  const title = `${decision.action} — ${decision.rationale}\n${decision.framing}`

  return (
    <div className="flex flex-col items-end gap-0.5" title={title}>
      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap ${actionStyle(decision.action)}`}>
        {actionShortLabel(decision.action)}
      </span>
      <span className="text-xs text-gray-300 dark:text-gray-700 tabular-nums">
        {pillar_total > 0 ? '+' : ''}{pillar_total}
      </span>
    </div>
  )
}
