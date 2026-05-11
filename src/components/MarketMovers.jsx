import { useState, useEffect } from 'react'
import { fetchQuote } from '../api'

const SCREENER = 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved'

async function fetchScreener(scrId, count = 8) {
  const res = await fetch(
    `${SCREENER}?scrIds=${scrId}&count=${count}&formatted=false&lang=en-US&region=US`
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const quotes = json.finance?.result?.[0]?.quotes
  if (!quotes) throw new Error(json.finance?.error?.description ?? 'No data returned')
  return quotes.map((q) => ({
    symbol: q.symbol,
    name: q.shortName ?? q.displayName ?? q.symbol,
    price: q.regularMarketPrice ?? 0,
    change: q.regularMarketChange ?? 0,
    changePct: q.regularMarketChangePercent ?? 0,
  }))
}

function MoverRow({ q, isLoss, selecting, onSelect }) {
  const busy = selecting === q.symbol
  const clr = isLoss ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
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
          <div>
            <div className="font-mono font-bold text-gray-900 dark:text-white text-xs">{q.symbol}</div>
            <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[110px]">{q.name}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-700 dark:text-gray-300 tabular-nums">
        ${q.price.toFixed(2)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold ${clr}`}>
        {q.change >= 0 ? '+' : '−'}${Math.abs(q.change).toFixed(2)}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-bold ${clr}`}>
        {q.changePct >= 0 ? '+' : ''}{q.changePct.toFixed(2)}%
      </td>
    </tr>
  )
}

function ColHead({ label, isLoss }) {
  return (
    <div className="px-3 py-2 flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-800">
      <span className={`text-xs font-bold ${isLoss ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
        {isLoss ? '▼' : '▲'}
      </span>
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
    </tr>
  </thead>
)

export default function MarketMovers({ onSelect }) {
  const [gainers, setGainers] = useState([])
  const [losers, setLosers]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [sortBy, setSortBy]   = useState('pct') // 'pct' | 'price'
  const [updated, setUpdated] = useState(null)
  const [selecting, setSelecting] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [g, l] = await Promise.all([
        fetchScreener('day_gainers'),
        fetchScreener('day_losers'),
      ])
      setGainers(g)
      setLosers(l)
      setUpdated(new Date())
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
        ? isLoss ? a.changePct - b.changePct : b.changePct - a.changePct
        : isLoss ? a.change   - b.change     : b.change   - a.change
    )

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Market Movers</h2>
          {loading && gainers.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-600">Updating…</span>
          )}
          {updated && !loading && (
            <span className="text-xs text-gray-300 dark:text-gray-700">
              {updated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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

      {/* Body */}
      {error ? (
        <div className="py-10 text-center space-y-2">
          <p className="text-xs text-gray-400 dark:text-gray-600">Could not load market data</p>
          <p className="text-xs text-gray-300 dark:text-gray-700 max-w-xs mx-auto">{error}</p>
          <button
            onClick={load}
            className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : loading && !gainers.length ? (
        <div className="py-12 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-gray-200 dark:border-gray-800 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-gray-800">
          <div>
            <ColHead label="Top Gainers" isLoss={false} />
            <table className="w-full">
              <THead />
              <tbody>
                {sorted(gainers, false).map((q) => (
                  <MoverRow key={q.symbol} q={q} isLoss={false} selecting={selecting} onSelect={handleSelect} />
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <ColHead label="Top Losers" isLoss={true} />
            <table className="w-full">
              <THead />
              <tbody>
                {sorted(losers, true).map((q) => (
                  <MoverRow key={q.symbol} q={q} isLoss={true} selecting={selecting} onSelect={handleSelect} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
