const usd = (n) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

export default function HoldingsSummary({ positions }) {
  if (!positions?.length) return null

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Positions</h2>
      </div>
      <div className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800/50">
              <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
              <th className="text-right px-4 py-2.5 font-medium">Cash Invested</th>
              <th className="text-right px-4 py-2.5 font-medium">Value Now</th>
              <th className="text-right px-4 py-2.5 font-medium">P&amp;L</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => {
              const isUp = (p.pnl ?? 0) >= 0
              return (
                <tr key={p.symbol} className="border-t border-gray-100 dark:border-gray-800/40">
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{p.symbol}</div>
                    {p.name && <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[160px]">{p.name}</div>}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">
                    {usd(p.netInvested)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums text-gray-900 dark:text-white font-medium">
                    {usd(p.currentValue)}
                  </td>
                  <td className={`text-right px-4 py-3 tabular-nums font-medium ${
                    p.pnl == null ? 'text-gray-300 dark:text-gray-700' : isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {p.pnl == null ? '—' : (
                      <>
                        <div>{isUp ? '+' : ''}{usd(p.pnl)}</div>
                        <div className="text-xs opacity-70">
                          {p.pnlPct == null ? '—' : `${isUp ? '+' : ''}${p.pnlPct.toFixed(2)}%`}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
