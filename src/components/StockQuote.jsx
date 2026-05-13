import { useEffect, useRef, lazy, Suspense } from 'react'
import { fetchQuote } from '../api'

const StockChart = lazy(() => import('./StockChart'))

const usd = (n) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const compact = (n) => {
  if (n == null) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return usd(n)
}

const vol = (n) => {
  if (!n) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toString()
}

export default function StockQuote({ quote, onUpdate, onClose }) {
  const refreshRef = useRef(null)

  useEffect(() => {
    if (!quote?.symbol) return
    const refresh = async () => {
      try { onUpdate(await fetchQuote(quote.symbol)) } catch {}
    }
    refreshRef.current = setInterval(refresh, 30000)
    return () => clearInterval(refreshRef.current)
  }, [quote?.symbol])

  if (!quote) return null

  const price = quote.regularMarketPrice ?? 0
  const change = quote.regularMarketChange ?? 0
  const changePct = quote.regularMarketChangePercent ?? 0
  const isUp = change >= 0
  const prevClose = quote.regularMarketPreviousClose

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono font-bold text-gray-900 dark:text-white text-base">{quote.symbol}</span>
            {quote.currency && (
              <span className="text-xs text-gray-500 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{quote.currency}</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-tight">{quote.shortName}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">${price.toFixed(2)}</p>
            <p className={`text-sm font-medium ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({isUp ? '+' : ''}{changePct.toFixed(2)}%)
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-0.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Row label="Open" value={usd(quote.regularMarketOpen)} />
        <Row label="Prev Close" value={usd(prevClose)} />
        <Row label="Day High" value={usd(quote.regularMarketDayHigh)} />
        <Row label="Day Low" value={usd(quote.regularMarketDayLow)} />
        <Row label="52W High" value={usd(quote.fiftyTwoWeekHigh)} />
        <Row label="52W Low" value={usd(quote.fiftyTwoWeekLow)} />
        <Row label="Volume" value={vol(quote.regularMarketVolume)} />
        <Row label="Mkt Cap" value={compact(quote.marketCap)} />
      </div>

      {prevClose && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-600 mb-0.5">
            <span>Day range</span>
          </div>
          <div className="relative h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
            {(() => {
              const lo = quote.regularMarketDayLow ?? prevClose
              const hi = quote.regularMarketDayHigh ?? prevClose
              const range = hi - lo
              const pct = range > 0 ? ((price - lo) / range) * 100 : 50
              return (
                <>
                  <div className={`absolute inset-0 ${isUp ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'}`} />
                  <div
                    className={`absolute top-0 bottom-0 w-1 rounded-full ${isUp ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-red-500 dark:bg-red-400'}`}
                    style={{ left: `${Math.min(Math.max(pct, 1), 99)}%` }}
                  />
                </>
              )
            })()}
          </div>
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-600">
            <span>{usd(quote.regularMarketDayLow)}</span>
            <span>{usd(quote.regularMarketDayHigh)}</span>
          </div>
        </div>
      )}

      <Suspense fallback={
        <div className="border-t border-gray-100 dark:border-gray-800 pt-4 h-36 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-800 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      }>
        <StockChart symbol={quote.symbol} />
      </Suspense>

      <p className="text-xs text-gray-300 dark:text-gray-700 text-center">
        {quote.regularMarketTime
          ? `as of ${new Date(quote.regularMarketTime * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
          : 'Auto-refreshes every 30s'}
      </p>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700 dark:text-gray-200 font-medium tabular-nums">{value}</span>
    </div>
  )
}
