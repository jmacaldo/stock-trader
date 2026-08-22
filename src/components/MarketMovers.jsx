import { useState, useEffect } from 'react'
import { fetchQuote } from '../api'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase'
import { formatAge, useNow } from '../time'
import { getTickerScore } from '../scoring/scoreCache'
import { actionShortLabel, actionStyle } from '../scoring/actionStyles'

const MOVERS_URL = `${SUPABASE_URL}/functions/v1/yahoo-movers`
const AUTH = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

async function fetchMovers(count = 10) {
  const res = await fetch(`${MOVERS_URL}?count=${count}`, { headers: AUTH })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { gainers, losers, actives } = await res.json()
  const times = [...gainers, ...losers, ...(actives ?? [])].map((q) => q.regularMarketTime).filter(Boolean)
  const updatedAt = times.length ? new Date(Math.min(...times) * 1000) : new Date()
  return { gainers, losers, actives: actives ?? [], updatedAt }
}

function ScoreBadge({ symbol }) {
  const [card, setCard] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    setCard(undefined)
    getTickerScore(symbol).then((c) => { if (!cancelled) setCard(c) })
    return () => { cancelled = true }
  }, [symbol])

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

function MoverRow({ q, selecting, onSelect }) {
  const busy = selecting === q.symbol
  const change = q.regularMarketChange ?? 0
  const changePct = q.regularMarketChangePercent ?? 0
  const isLoss = changePct < 0
  const clr = isLoss ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
  const price = q.regularMarketPrice ?? 0
  return (
    <tr
      onClick={() => onSelect(q.symbol)}
      className="border-t border-gray-100 dark:border-gray-800/40 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors"
    >
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {busy && (
            <div className="w-3 h-3 border border-gray-300 dark:border-gray-600 border-t-emerald-500 rounded-full animate-spin shrink-0" />
          )}
          <div className="font-mono font-bold text-gray-900 dark:text-white text-xs">{q.symbol}</div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-700 dark:text-gray-300 tabular-nums">
        ${price.toFixed(2)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold ${clr}`}>
        {change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(2)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-bold ${clr}`}>
        {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
      </td>
      <td className="px-3 py-2.5 text-right">
        <ScoreBadge symbol={q.symbol} />
      </td>
    </tr>
  )
}

function ColHead({ label, icon = '▲', color = 'text-emerald-600 dark:text-emerald-400' }) {
  return (
    <div className="px-3 py-2 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-800">
      <span className={`text-xs font-bold ${color}`}>{icon}</span>
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{label}</span>
    </div>
  )
}

const THead = () => (
  <thead>
    <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide">
      <th className="text-left px-3 py-1.5 font-medium">Symbol</th>
      <th className="text-right px-3 py-1.5 font-medium">Price</th>
      <th className="text-right px-3 py-1.5 font-medium">Change</th>
      <th className="text-right px-3 py-1.5 font-medium">%</th>
      <th className="text-right px-3 py-1.5 font-medium">Score</th>
    </tr>
  </thead>
)

export default function MarketMovers({ onSelect }) {
  useNow()
  const [gainers, setGainers] = useState([])
  const [losers, setLosers]   = useState([])
  const [actives, setActives] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [sortBy, setSortBy]   = useState('pct')
  const [updated, setUpdated] = useState(null)
  const [selecting, setSelecting] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { gainers: g, losers: l, actives: a, updatedAt } = await fetchMovers(10)
      setGainers(g)
      setLosers(l)
      setActives(a)
      setUpdated(updatedAt)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [])

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

  const sorted = (list, isLoss) =>
    [...list].sort((a, b) =>
      sortBy === 'pct'
        ? isLoss
          ? a.regularMarketChangePercent - b.regularMarketChangePercent
          : b.regularMarketChangePercent - a.regularMarketChangePercent
        : isLoss
          ? a.regularMarketChange - b.regularMarketChange
          : b.regularMarketChange - a.regularMarketChange
    )

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Market Movers</h2>
          {loading && gainers.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-600">Updating…</span>
          )}
          {updated && !loading && (
            <span className="text-xs text-gray-300 dark:text-gray-700">
              {formatAge(updated)}
            </span>
          )}
        </div>
        <div className="flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {[['pct', '% Change'], ['price', '$ Change']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setSortBy(val)}
              className={`text-xs px-2.5 py-1 font-medium transition-colors ${
                sortBy === val
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="py-10 text-center space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-600">Could not load market data</p>
          <p className="text-xs text-gray-300 dark:text-gray-700 max-w-xs mx-auto">{error}</p>
          <button onClick={load} className="text-xs text-blue-500 hover:text-blue-400 transition-colors">
            Try again
          </button>
        </div>
      ) : loading && !gainers.length ? (
        <div className="py-12 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-200 dark:border-gray-800 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-800">
            <div>
              <ColHead label="Top Gainers" icon="▲" color="text-emerald-600 dark:text-emerald-400" />
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full min-w-[420px]">
                  <THead />
                  <tbody>
                    {sorted(gainers, false).map((q) => (
                      <MoverRow key={q.symbol} q={q} selecting={selecting} onSelect={handleSelect} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <ColHead label="Top Losers" icon="▼" color="text-red-500 dark:text-red-400" />
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full min-w-[420px]">
                  <THead />
                  <tbody>
                    {sorted(losers, true).map((q) => (
                      <MoverRow key={q.symbol} q={q} selecting={selecting} onSelect={handleSelect} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800">
            <ColHead label="Most Active" icon="⚡" color="text-blue-500 dark:text-blue-400" />
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full min-w-[420px]">
                <THead />
                <tbody>
                  {actives.map((q) => (
                    <MoverRow key={q.symbol} q={q} selecting={selecting} onSelect={handleSelect} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
