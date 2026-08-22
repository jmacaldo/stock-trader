const usd = (n) =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

function sum(list, key) {
  return list.reduce((s, p) => s + (p[key] ?? 0), 0)
}

function TotalRow({ label, invested, value, pnl, pnlPct, border }) {
  const isUp = pnl >= 0
  return (
    <tr className={`bg-gray-50 dark:bg-gray-800/30 ${border ? 'border-t-2 border-gray-200 dark:border-gray-700' : 'border-t border-gray-100 dark:border-gray-800/40'}`}>
      <td className="px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">{label}</td>
      <td className="text-right px-4 py-2.5 text-gray-700 dark:text-gray-300 font-bold tabular-nums text-sm">
        {usd(invested)}
      </td>
      <td className="text-right px-4 py-2.5 text-gray-900 dark:text-white font-bold tabular-nums text-sm">
        {usd(value)}
      </td>
      <td className={`text-right px-4 py-2.5 font-bold tabular-nums text-sm ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        <div>{isUp ? '+' : ''}{usd(pnl)}</div>
        <div className="text-xs font-medium opacity-70">{isUp ? '+' : ''}{pnlPct.toFixed(2)}%</div>
      </td>
    </tr>
  )
}

export default function HoldingsSummary({ positions }) {
  if (!positions?.length) return null

  const open = positions.filter((p) => !p.closed)
  const closed = positions.filter((p) => p.closed)
  const sorted = [...open, ...closed]

  const openInvested = sum(open, 'netInvested')
  const openValue = sum(open, 'currentValue')
  const openPnl = openValue - openInvested
  const openPnlPct = openInvested > 0 ? (openPnl / openInvested) * 100 : 0

  const allInvested = sum(positions, 'netInvested')
  const allValue = sum(positions, 'currentValue') // closed positions contribute 0
  const allPnl = allValue - allInvested
  const allCostBasis = sum(positions, 'costBasis') // gross capital ever deployed — the only sound % base once realized trades are mixed in
  const allPnlPct = allCostBasis > 0 ? (allPnl / allCostBasis) * 100 : 0

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
            {sorted.map((p) => {
              const isUp = (p.pnl ?? 0) >= 0
              return (
                <tr key={p.symbol} className={`border-t border-gray-100 dark:border-gray-800/40 ${p.closed ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{p.symbol}</div>
                      {p.closed && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 font-medium uppercase tracking-wide">
                          Closed
                        </span>
                      )}
                    </div>
                    {p.name && <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[160px]">{p.name}</div>}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">
                    {usd(p.netInvested)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums text-gray-900 dark:text-white font-medium">
                    {p.closed ? <span className="text-gray-300 dark:text-gray-700">—</span> : usd(p.currentValue)}
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
          <tfoot>
            <TotalRow
              label={`Open · ${open.length} position${open.length !== 1 ? 's' : ''}`}
              invested={openInvested} value={openValue} pnl={openPnl} pnlPct={openPnlPct}
              border
            />
            {closed.length > 0 && (
              <TotalRow
                label={`All (incl. closed) · ${positions.length} position${positions.length !== 1 ? 's' : ''}`}
                invested={allInvested} value={allValue} pnl={allPnl} pnlPct={allPnlPct}
              />
            )}
          </tfoot>
        </table>
      </div>
    </div>
  )
}
