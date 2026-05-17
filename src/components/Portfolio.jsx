import { useEffect, useState, useRef, Fragment } from 'react'
import { useStore } from '../store'
import { refreshPrices } from '../prices'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase'
import { formatAge, useNow } from '../time'

const QUOTES_URL = `${SUPABASE_URL}/functions/v1/yahoo-quotes`
const AUTH = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

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

function computeSignal(q, { netInvested, netShares }) {
  if (!q || !netShares) return null
  const {
    regularMarketPrice, regularMarketChangePercent,
    regularMarketVolume, averageDailyVolume3Month,
    regularMarketDayHigh, regularMarketDayLow,
    fiftyTwoWeekHigh, fiftyTwoWeekLow,
  } = q
  if (!averageDailyVolume3Month || !regularMarketDayHigh || !regularMarketDayLow) return null

  const relVol      = regularMarketVolume / averageDailyVolume3Month
  const dayRange    = regularMarketDayHigh - regularMarketDayLow
  const intradayPos = dayRange > 0 ? (regularMarketPrice - regularMarketDayLow) / dayRange : 0.5
  const fiftyTwoRange = (fiftyTwoWeekHigh ?? 0) - (fiftyTwoWeekLow ?? 0)
  const fiftyTwoPos = fiftyTwoRange > 0 ? (regularMarketPrice - fiftyTwoWeekLow) / fiftyTwoRange : 0.5
  const changePct   = regularMarketChangePercent ?? 0
  const totalReturn = netInvested > 0 ? ((regularMarketPrice * netShares - netInvested) / netInvested) * 100 : 0

  if ((intradayPos <= 0.35 && relVol >= 2.0) || totalReturn <= -15 || (fiftyTwoPos <= 0.15 && changePct < 0))
    return { signal: 'SELL', totalReturn }
  if ((totalReturn >= 30 && intradayPos <= 0.50) || (fiftyTwoPos >= 0.90 && intradayPos <= 0.40))
    return { signal: 'TRIM', totalReturn }
  if (relVol >= 2.0 && intradayPos >= 0.65 && changePct > 0 && totalReturn > -5)
    return { signal: 'ADD', totalReturn }
  if (relVol >= 2.0 || Math.abs(changePct) > 3)
    return { signal: 'WATCH', totalReturn }
  return { signal: 'HOLD', totalReturn }
}

const SIGNAL_STYLES = {
  ADD:  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  HOLD: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  SELL: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  TRIM: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  WATCH:'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
}

export default function Portfolio({ onValueChange }) {
  useNow()
  const { portfolio, sellStock } = useStore()
  const [prices, setPrices]         = useState({})
  const [loading, setLoading]       = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [selling, setSelling]       = useState(null)
  const [sellInput, setSellInput]   = useState('')
  const [sellError, setSellError]   = useState(null)
  const onValueChangeRef = useRef(onValueChange)
  onValueChangeRef.current = onValueChange

  const symbols = Object.keys(portfolio)
  const [enrichedData, setEnrichedData] = useState({})

  useEffect(() => {
    if (!symbols.length) { setEnrichedData({}); return }
    fetchEnriched(symbols).then(setEnrichedData)
    const t = setInterval(() => fetchEnriched(symbols).then(setEnrichedData), 300_000)
    return () => clearInterval(t)
  }, [symbols.join(',')])

  useEffect(() => {
    if (!symbols.length) {
      onValueChangeRef.current?.(0)
      setPrices({})
      return
    }

    const load = async () => {
      setLoading(true)
      try {
        const { prices: map, asOf } = await refreshPrices(symbols)
        setPrices(map)
        const total = symbols.reduce((sum, sym) => sum + (portfolio[sym].shares * (map[sym] ?? portfolio[sym].avgCost)), 0)
        onValueChangeRef.current?.(total)
        setLastUpdated(asOf ?? new Date())
      } catch {
        const total = symbols.reduce((sum, sym) => sum + portfolio[sym].shares * portfolio[sym].avgCost, 0)
        onValueChangeRef.current?.(total)
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [symbols.join(',')])

  const openSell = (sym) => { setSelling(sym); setSellInput(''); setSellError(null) }
  const closeSell = () => { setSelling(null); setSellInput(''); setSellError(null) }

  const handleSell = (sym, current, maxValue) => {
    const amount = parseFloat(sellInput)
    if (!amount || amount <= 0)   { setSellError('Enter an amount'); return }
    if (amount > maxValue + 0.01) { setSellError(`Max is ${usd(maxValue)}`); return }
    const sharesToSell = Math.min(amount / current, portfolio[sym]?.shares ?? 0)
    const result = sellStock(sym, sharesToSell, current)
    if (result?.error) { setSellError(result.error); return }
    closeSell()
  }

  if (!symbols.length) {
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Portfolio</h2>
        <div className="text-center py-10">
          <p className="text-gray-400 dark:text-gray-600 text-sm">No holdings yet</p>
          <p className="text-gray-300 dark:text-gray-700 text-xs mt-1">Search for a stock and place your first trade</p>
        </div>
      </div>
    )
  }

  let totalValue = 0
  let totalCost = 0
  let totalPnl = 0

  const rows = symbols.map((sym) => {
    const { shares, avgCost, name } = portfolio[sym]
    const current = prices[sym] ?? avgCost
    const value = shares * current
    const cost = shares * avgCost
    const pnl = value - cost
    const purchVal = cost * shares
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
    const change = prices[sym] ? (prices[sym] - avgCost) / avgCost * 100 : 0
    totalValue += value
    totalCost += cost
    totalPnl += pnl
    return { sym, shares, avgCost, name, purchVal, current, value, cost, pnl, pnlPct, change }
    console.log("this is a test" );
  })

  
  
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Portfolio</h2>
          <span className="text-xs text-gray-400 dark:text-gray-700">{symbols.length} position{symbols.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-gray-400 dark:text-gray-600">Updating...</span>}
          {lastUpdated && !loading && (
            <span className="text-xs text-gray-300 dark:text-gray-700">
              {formatAge(lastUpdated)}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800/50">
              <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
              <th className="text-right px-4 py-2.5 font-medium">Shares</th>
              <th className="text-right px-4 py-2.5 font-medium">Cost</th>
              <th className="text-right px-4 py-2.5 font-medium">Live Price</th>
              <th className="text-right px-4 py-2.5 font-medium">Signal</th>
              <th className="text-right px-4 py-2.5 font-medium">Live Value</th>
              <th className="text-right px-4 py-2.5 font-medium">P&L</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sym, shares, avgCost, name, current, value, pnl, pnlPct }) => {
              const sig = computeSignal(enrichedData[sym], { netInvested: shares * avgCost, netShares: shares })
              return (
                <Fragment key={sym}>
                <tr className="border-t border-gray-100 dark:border-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{sym}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[130px]">{name}</div>
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">{shares < 1 ? shares.toFixed(6) : shares.toFixed(4)}</td>
                  <td className="text-right px-4 py-3 text-gray-400 dark:text-gray-500 tabular-nums text-xs">{usd(avgCost)}</td>
                  <td className="text-right px-4 py-3 text-gray-700 dark:text-gray-200 tabular-nums font-medium">{usd(current)}</td>
                  <td className="text-right px-4 py-3">
                    {sig ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${SIGNAL_STYLES[sig.signal]}`}>
                          {sig.signal}
                        </span>
                        <span className={`text-xs tabular-nums ${sig.totalReturn >= 0 ? 'text-emerald-500 dark:text-emerald-600' : 'text-red-500 dark:text-red-600'}`}>
                          {sig.totalReturn >= 0 ? '+' : ''}{sig.totalReturn.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 dark:text-gray-700">—</span>
                    )}
                  </td>
                  <td className="text-right px-4 py-3 text-gray-900 dark:text-white tabular-nums font-semibold">{usd(value)}</td>
                  <td className="text-right px-4 py-3">
                    <div className={`font-semibold tabular-nums ${pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {pnl >= 0 ? '+' : ''}{usd(pnl)}
                    </div>
                    <div className={`text-xs ${pnl >= 0 ? 'text-emerald-500 dark:text-emerald-600' : 'text-red-500 dark:text-red-600'}`}>
                      {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => selling === sym ? closeSell() : openSell(sym)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${
                        selling === sym
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                          : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40'
                      }`}
                    >
                      {selling === sym ? 'Cancel' : 'Sell'}
                    </button>
                    {selling === sym && (
                      <div className="mt-2 flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">$</span>
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            step="0.01"
                            value={sellInput}
                            onChange={(e) => { setSellInput(e.target.value); setSellError(null) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSell(sym, current, value); if (e.key === 'Escape') closeSell() }}
                            placeholder="0.00"
                            className="w-24 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1 text-xs tabular-nums text-gray-900 dark:text-white focus:outline-none focus:border-red-400 transition-colors"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSellInput(value.toFixed(2))}
                            className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                          >
                            Max
                          </button>
                          <button
                            onClick={() => handleSell(sym, current, value)}
                            className="text-xs px-2.5 py-1 bg-red-500 hover:bg-red-400 text-white rounded-lg font-medium transition-colors"
                          >
                            Cash Out
                          </button>
                        </div>
                        {sellError && <span className="text-xs text-red-500 text-right">{sellError}</span>}
                        {sellInput && !sellError && (
                          <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">
                            ≈ {((parseFloat(sellInput) || 0) / current).toFixed(4)} sh
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                </Fragment>
              )
            })}
          </tbody>
          {symbols.length > 1 && (
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
                <td colSpan={5} className="px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Total</td>
                <td className="text-right px-4 py-2.5 text-gray-900 dark:text-white font-bold tabular-nums">{usd(totalValue)}</td>
                <td className={`text-right px-4 py-2.5 font-bold tabular-nums ${totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{usd(totalPnl)}
                </td>
                <td className="px-4 py-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
