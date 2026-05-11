import { useState, useEffect } from 'react'
import { fetchQuote, fetchQuotes } from '../api'

const WATCHLIST = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','JPM','V','UNH',
  'XOM','JNJ','WMT','MA','PG','LLY','HD','CVX','MRK','ABBV',
  'AVGO','COST','KO','ADBE','CSCO','BAC','CRM','NFLX','AMD','DIS',
  'NKE','ORCL','INTC','QCOM','TXN','AMGN','GS','CAT','BA','GE',
  'PLTR','COIN','SOFI','RIVN','LCID','MSTR','AMC','GME','HOOD','RBLX',
]

async function fetchMovers(count = 8) {
  const quotes = await fetchQuotes(WATCHLIST)
  const valid = quotes.filter((q) => q.regularMarketChangePercent != null)
  const sorted = [...valid].sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
  return {
    gainers: sorted.slice(0, count),
    losers: sorted.slice(-count).reverse(),
  }
}

function MoverRow({ q, isLoss, selecting, onSelect }) {
  const busy = selecting === q.symbol
  const clr = isLoss ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
  const change = q.regularMarketChange ?? 0
  const changePct = q.regularMarketChangePercent ?? 0
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
  const [sortBy, setSortBy]   = useState('pct')
  const [updated, setUpdated] = useState(null)
  const [selecting, setSelecting] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const { gainers: g, losers: l } = await fetchMovers(8)
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
