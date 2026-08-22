import { useState, useEffect } from 'react'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase'
import { useStore } from '../store'
import { fetchQuote } from '../api'
import { formatAge, useNow } from '../time'
import { getTickerScore } from '../scoring/scoreCache'
import { actionShortLabel, actionStyle } from '../scoring/actionStyles'

const QUOTES_URL = `${SUPABASE_URL}/functions/v1/yahoo-quotes`
const AUTH       = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

async function fetchEnriched(symbols) {
  if (!symbols.length) return {}
  try {
    const res = await fetch(`${QUOTES_URL}?symbols=${symbols.join(',')}`, { headers: AUTH })
    if (!res.ok) return {}
    const { quotes } = await res.json()
    return Object.fromEntries((quotes ?? []).map((q) => [q.symbol, q]))
  } catch {
    return {}
  }
}

function computeSignal(q) {
  if (!q?.averageDailyVolume3Month || !q.regularMarketDayHigh || !q.regularMarketDayLow) return null

  const relVol      = q.regularMarketVolume / q.averageDailyVolume3Month
  const dayRange    = q.regularMarketDayHigh - q.regularMarketDayLow
  const intradayPos = dayRange > 0 ? (q.regularMarketPrice - q.regularMarketDayLow) / dayRange : 0.5
  const changePct   = q.regularMarketChangePercent ?? 0

  if (relVol >= 2.0 && intradayPos >= 0.65 && changePct > 0)  return { signal: 'BUY',   relVol, intradayPos }
  if (relVol >= 2.0 && intradayPos <= 0.35 && changePct > 0)  return { signal: 'SELL',  relVol, intradayPos }
  if (relVol >= 2.0 && intradayPos <= 0.35 && changePct < 0)  return { signal: 'SHORT', relVol, intradayPos }
  if (relVol < 1.5 || (intradayPos > 0.35 && intradayPos < 0.65)) return { signal: 'AVOID', relVol, intradayPos }
  if (relVol >= 2.0) return { signal: 'WATCH', relVol, intradayPos }
  return { signal: 'WATCH', relVol, intradayPos }
}

const SIGNAL_STYLES = {
  BUY:   'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  SELL:  'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  SHORT: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  AVOID: 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600',
  WATCH: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
}

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function Watchlist({ onSelect }) {
  useNow()
  const { userId, watchlist: storedWatchlist, setWatchlist } = useStore()

  // Bootstrap from persisted store so items survive page reloads without a DB round-trip
  const [items, _setItems]      = useState(storedWatchlist ?? [])
  const [enriched, setEnriched] = useState({})
  const [scores, setScores]     = useState({})
  const [input, setInput]       = useState('')
  const [adding, setAdding]     = useState(false)
  const [addError, setAddError] = useState(null)
  const [removing, setRemoving]   = useState(null)
  const [selecting, setSelecting] = useState(null)
  const [loading, setLoading]     = useState(!(storedWatchlist?.length))
  const [enrichedAt, setEnrichedAt] = useState(null)

  // Keep store in sync whenever items change
  const setItems = (updaterOrValue) => {
    _setItems((prev) => {
      const next = typeof updaterOrValue === 'function' ? updaterOrValue(prev) : updaterOrValue
      setWatchlist(next)
      return next
    })
  }

  // Sync from DB in the background to catch any changes from other sessions
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (cancelled || !data) return
setItems(data)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  // Fetch enriched data for all symbols
  const symbolsKey = items.map((i) => i.symbol).sort().join(',')
  useEffect(() => {
    const symbols = items.map((i) => i.symbol)
    if (!symbols.length) { setEnriched({}); return }
    const refresh = () => fetchEnriched(symbols).then((d) => { setEnriched(d); setEnrichedAt(new Date()) })
    refresh()
    const t = setInterval(refresh, 300_000)
    return () => clearInterval(t)
  }, [symbolsKey])

  // Fetch technical (Trend/Momentum/Macro) scores — cached client-side with a
  // 1h TTL since they're derived from daily closes, not live quotes.
  useEffect(() => {
    const symbols = items.map((i) => i.symbol)
    if (!symbols.length) { setScores({}); return }
    let cancelled = false
    Promise.all(symbols.map((sym) => getTickerScore(sym).then((card) => [sym, card])))
      .then((pairs) => { if (!cancelled) setScores(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
  }, [symbolsKey])

  const handleAdd = async (e) => {
    e.preventDefault()
    const symbol = input.trim().toUpperCase()
    if (!symbol) return
    if (items.some((i) => i.symbol === symbol)) {
      setAddError('Already in watchlist')
      return
    }
    setAdding(true)
    setAddError(null)
    try {
      // Fetch quote for name + validate; fetch enriched for signal data
      const [quoteResult, enrichedData] = await Promise.all([
        fetchQuote(symbol).catch(() => null),
        fetchEnriched([symbol]),
      ])
      if (!quoteResult && !enrichedData[symbol]) { setAddError('Symbol not found'); return }

      const name = quoteResult?.shortName ?? null
      const addedPrice = enrichedData[symbol]?.regularMarketPrice ?? quoteResult?.regularMarketPrice ?? null
      const { data: rows, error } = await supabase
        .from('watchlist')
        .insert({ user_id: userId, symbol, name, added_price: addedPrice, added_at: new Date().toISOString() })
        .select()
      if (error?.code === '23505') { setAddError('Already in watchlist'); return }
      if (error) throw error

      setItems((prev) => [...prev, rows?.[0] ?? { symbol, name }])
      setEnriched((prev) => ({ ...prev, [symbol]: enrichedData[symbol] }))
      setInput('')
    } catch (err) {
      setAddError('Could not add symbol')
    } finally {
      setAdding(false)
    }
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

  const handleRemove = async (symbol) => {
    setRemoving(symbol)
    await supabase.from('watchlist').delete().match({ user_id: userId, symbol })
    setItems((prev) => prev.filter((i) => i.symbol !== symbol))
    setRemoving(null)
  }

  if (loading && !items.length) return null

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Watchlist</h2>
          {enrichedAt && <span className="text-xs text-gray-300 dark:text-gray-700">{formatAge(enrichedAt)}</span>}
        </div>
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          {addError && <span className="text-xs text-red-500">{addError}</span>}
          <input
            value={input}
            onChange={(e) => { setInput(e.target.value.toUpperCase()); setAddError(null) }}
            placeholder="Symbol"
            maxLength={10}
            className="w-24 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500 transition-colors uppercase"
          />
          <button
            type="submit"
            disabled={adding || !input.trim()}
            className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
          >
            {adding ? '…' : '+ Add'}
          </button>
        </form>
      </div>

      {/* Empty state */}
      {!items.length && (
        <div className="py-10 text-center">
          <p className="text-gray-400 dark:text-gray-600 text-sm">No symbols yet</p>
          <p className="text-gray-300 dark:text-gray-700 text-xs mt-1">Add a ticker to start watching</p>
        </div>
      )}

      {/* Table */}
      {items.length > 0 && (
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm min-w-[680px]">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800/50">
                <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                <th className="text-right px-4 py-2.5 font-medium">Price</th>
                <th className="text-right px-4 py-2.5 font-medium">Added</th>
                <th className="text-right px-4 py-2.5 font-medium">Change</th>
                <th className="text-right px-4 py-2.5 font-medium">Signal</th>
                <th className="text-right px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const q = enriched[item.symbol]
                const sig = q ? computeSignal(q) : null
                const changePct = q && item.added_price
                  ? ((q.regularMarketPrice - item.added_price) / item.added_price) * 100
                  : q?.regularMarketChangePercent ?? null
                const isUp = (changePct ?? 0) >= 0
                const marketTime = q?.regularMarketTime
                  ? formatAge(new Date(q.regularMarketTime * 1000))
                  : null

                const busy = selecting === item.symbol
                return (
                  <tr
                    key={item.symbol}
                    onClick={() => handleSelect(item.symbol)}
                    className="border-t border-gray-100 dark:border-gray-800/40 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {busy && <div className="w-3 h-3 border border-gray-300 dark:border-gray-600 border-t-emerald-500 rounded-full animate-spin shrink-0" />}
                        <div>
                          <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{item.symbol}</div>
                          {item.name && <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[140px]">{item.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="text-right px-4 py-3 tabular-nums text-sm">
                      <div className="text-gray-700 dark:text-gray-200">{q ? usd(q.regularMarketPrice) : '—'}</div>
                      {marketTime && <div className="text-xs text-gray-300 dark:text-gray-700">{marketTime}</div>}
                    </td>
                    <td className="text-right px-4 py-3 tabular-nums text-sm text-gray-400 dark:text-gray-500">
                      {item.added_price ? usd(item.added_price) : '—'}
                      {item.added_at && (
                        <div className="text-xs text-gray-300 dark:text-gray-700">
                          {new Date(item.added_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td className={`text-right px-4 py-3 tabular-nums text-sm font-medium ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {changePct != null ? `${isUp ? '+' : ''}${changePct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="text-right px-4 py-3">
                      {sig ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${SIGNAL_STYLES[sig.signal]}`}>
                            {sig.signal}
                          </span>
                          <span className="text-xs text-gray-300 dark:text-gray-700 tabular-nums">
                            {sig.relVol.toFixed(1)}× vol
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-700">—</span>
                      )}
                    </td>
                    <td className="text-right px-4 py-3">
                      {(() => {
                        const card = scores[item.symbol]
                        if (card === undefined) return <span className="text-xs text-gray-300 dark:text-gray-700">…</span>
                        if (!card) return <span className="text-xs text-gray-300 dark:text-gray-700">—</span>
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
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemove(item.symbol) }}
                        disabled={removing === item.symbol}
                        className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Remove"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
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
