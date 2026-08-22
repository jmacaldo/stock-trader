import { useState, useRef, useEffect } from 'react'
import { STOCKS } from '../stocks'
import { fetchQuote } from '../api'
import { getTickerScore } from '../scoring/scoreCache'
import { loadScanResults, saveScanResults } from '../scoring/scanDb'
import { actionShortLabel, actionStyle } from '../scoring/actionStyles'
import { formatAge, useNow } from '../time'

// Dedupe the curated list (a couple of symbols like AMZN appear in more than
// one sector bucket) into a single scan universe.
const UNIVERSE = [...new Map(STOCKS.map((s) => [s.symbol, s])).values()]
const CONCURRENCY = 6

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Rebound-trigger actions are exactly the decisions score.js reaches when it
// detects a fresh reversal (RSI/MACD/TRIX turning) before cumulative price
// change is large enough to land the symbol on a "top movers" list.
const isReboundAction = (action) => action.startsWith('RE-ENTRY') || action.startsWith('TACTICAL REBOUND')

export default function MomentumScanner({ onSelect }) {
  useNow()
  const [results, setResults] = useState([])
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [scannedAt, setScannedAt] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [selecting, setSelecting] = useState(null)
  const cancelRef = useRef(false)

  // Pick up the last scan's results from the DB so a page reload doesn't
  // reset to "Not scanned yet" — the scan is objective/shared, not per-session.
  useEffect(() => {
    loadScanResults().then((saved) => {
      if (saved) { setResults(saved.hits); setScannedAt(saved.scannedAt) }
      setLoaded(true)
    })
  }, [])

  const scan = async () => {
    if (scanning) return
    cancelRef.current = false
    setScanning(true)
    setProgress(0)
    let done = 0
    const hits = []

    await mapWithConcurrency(UNIVERSE, CONCURRENCY, async (stock) => {
      if (cancelRef.current) return
      const card = await getTickerScore(stock.symbol)
      done++
      setProgress(done)
      if (card && isReboundAction(card.decision.action)) {
        hits.push({
          symbol: stock.symbol,
          name: stock.name,
          action: card.decision.action,
          pillarTotal: card.pillar_total,
          trendScore: card.pillars.trend.score,
          momentumScore: card.pillars.momentum.score,
          reboundFlag: card.decision.flags.rebound[0] ?? null,
        })
      }
    })

    hits.sort((a, b) => b.pillarTotal - a.pillarTotal)
    setResults(hits)
    setScannedAt(new Date())
    setScanning(false)
    saveScanResults(hits).catch(console.error)
  }

  const handleSelect = async (symbol) => {
    if (selecting) return
    setSelecting(symbol)
    try {
      const quote = await fetchQuote(symbol)
      onSelect?.(quote)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {}
    setSelecting(null)
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Momentum Scanner</h2>
          <span className="text-xs text-gray-400 dark:text-gray-600">
            {scanning ? `Scanning ${progress}/${UNIVERSE.length}…` : `${UNIVERSE.length} symbols · fresh rebound triggers`}
          </span>
          {scannedAt && !scanning && (
            <span className="text-xs text-gray-300 dark:text-gray-700">{formatAge(scannedAt)}</span>
          )}
        </div>
        <button
          onClick={scan}
          disabled={scanning}
          className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
        >
          {scanning ? 'Scanning…' : scannedAt ? 'Re-scan' : 'Scan'}
        </button>
      </div>

      {loaded && !scannedAt && !scanning && (
        <div className="py-10 text-center">
          <p className="text-gray-400 dark:text-gray-600 text-sm">Not scanned yet</p>
          <p className="text-gray-300 dark:text-gray-700 text-xs mt-1 max-w-sm mx-auto">
            Scans a curated universe of {UNIVERSE.length} stocks/ETFs for fresh RE-ENTRY / rebound signals —
            catches momentum at the inflection point, before it's big enough to land on a top-movers list.
          </p>
        </div>
      )}

      {scannedAt && !results.length && !scanning && (
        <div className="py-10 text-center">
          <p className="text-gray-400 dark:text-gray-600 text-sm">No rebound triggers right now</p>
          <p className="text-gray-300 dark:text-gray-700 text-xs mt-1">Try again later, or after the next close.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800/50">
                <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                <th className="text-right px-4 py-2.5 font-medium">Trend</th>
                <th className="text-right px-4 py-2.5 font-medium">Momentum</th>
                <th className="text-right px-4 py-2.5 font-medium">Signal</th>
                <th className="text-left px-4 py-2.5 font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({ symbol, name, action, trendScore, momentumScore, reboundFlag }) => {
                const busy = selecting === symbol
                return (
                  <tr
                    key={symbol}
                    onClick={() => handleSelect(symbol)}
                    className="border-t border-gray-100 dark:border-gray-800/40 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {busy && <div className="w-3 h-3 border border-gray-300 dark:border-gray-600 border-t-emerald-500 rounded-full animate-spin shrink-0" />}
                        <div>
                          <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{symbol}</div>
                          <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[140px]">{name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 tabular-nums text-sm text-gray-600 dark:text-gray-300">
                      {trendScore > 0 ? '+' : ''}{trendScore}
                    </td>
                    <td className="text-right px-4 py-3 tabular-nums text-sm text-gray-600 dark:text-gray-300">
                      {momentumScore > 0 ? '+' : ''}{momentumScore}
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold whitespace-nowrap ${actionStyle(action)}`}>
                        {actionShortLabel(action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-600 max-w-[260px] truncate" title={reboundFlag ?? ''}>
                      {reboundFlag}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
