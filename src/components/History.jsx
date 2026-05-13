import { useStore } from '../store'

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const fmtDate = (iso) => {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  }
}

export default function History() {
  const { trades } = useStore()

  if (!trades.length) return null

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Trade History</h2>
        <span className="text-xs text-gray-400 dark:text-gray-700">{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto scrollbar-hide">
        <table className="w-full text-sm min-w-[480px]">
          <thead className="sticky top-0 bg-white dark:bg-gray-900 z-10">
            <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800/50">
              <th className="text-left px-4 py-2.5 font-medium">Date</th>
              <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
              <th className="text-left px-4 py-2.5 font-medium">Side</th>
              <th className="text-right px-4 py-2.5 font-medium">Shares</th>
              <th className="text-right px-4 py-2.5 font-medium">Price</th>
              <th className="text-right px-4 py-2.5 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const { date, time } = fmtDate(t.timestamp)
              return (
                <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-2.5 text-gray-400 dark:text-gray-600 text-xs whitespace-nowrap">
                    <div>{date}</div>
                    <div>{time}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{t.symbol}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[120px]">{t.name}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-md ${
                      t.type === 'BUY'
                        ? 'bg-emerald-100/60 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/40'
                        : 'bg-red-100/60 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200/60 dark:border-red-900/40'
                    }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="text-right px-4 py-2.5 text-gray-600 dark:text-gray-300 tabular-nums">{t.shares < 1 ? t.shares.toFixed(6) : t.shares.toFixed(4)}</td>
                  <td className="text-right px-4 py-2.5 text-gray-500 dark:text-gray-400 tabular-nums text-xs">{usd(t.price)}</td>
                  <td className="text-right px-4 py-2.5 text-gray-900 dark:text-white font-semibold tabular-nums">{usd(t.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
