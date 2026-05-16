import { useEffect, useState, useRef } from 'react'
import { useStore } from '../store'
import { refreshPrices } from '../prices'

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function Portfolio({ onValueChange }) {
  const { portfolio } = useStore()
  const [prices, setPrices] = useState({})
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const onValueChangeRef = useRef(onValueChange)
  onValueChangeRef.current = onValueChange

  const symbols = Object.keys(portfolio)

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
              as of {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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
              <th className="text-right px-4 py-2.5 font-medium">Live Value</th>
              <th className="text-right px-4 py-2.5 font-medium">P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ sym, shares, avgCost, name, current, value, pnl, pnlPct }) => (
              <tr key={sym} className="border-t border-gray-100 dark:border-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{sym}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[130px]">{name}</div>
                </td>
                <td className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">{shares < 1 ? shares.toFixed(6) : shares.toFixed(4)}</td>
                <td className="text-right px-4 py-3 text-gray-400 dark:text-gray-500 tabular-nums text-xs">{usd(avgCost)}</td>
                <td className="text-right px-4 py-3 text-gray-700 dark:text-gray-200 tabular-nums font-medium">{usd(current)}</td>
                <td className="text-right px-4 py-3 text-gray-900 dark:text-white tabular-nums font-semibold">{usd(value)}</td>
                <td className="text-right px-4 py-3">
                  <div className={`font-semibold tabular-nums ${pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {pnl >= 0 ? '+' : ''}{usd(pnl)}
                  </div>
                  <div className={`text-xs ${pnl >= 0 ? 'text-emerald-500 dark:text-emerald-600' : 'text-red-500 dark:text-red-600'}`}>
                    {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {symbols.length > 1 && (
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
                <td colSpan={4} className="px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">Total</td>
                <td className="text-right px-4 py-2.5 text-gray-900 dark:text-white font-bold tabular-nums">{usd(totalValue)}</td>
                <td className={`text-right px-4 py-2.5 font-bold tabular-nums ${totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{usd(totalPnl)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
