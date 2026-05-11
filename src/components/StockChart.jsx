import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTheme } from '../useTheme'

const RANGES = [
  { label: '1D',  range: '1d',  interval: '60m' },
  { label: '1W',  range: '5d',  interval: '1d'  },
  { label: '1M',  range: '1mo', interval: '1d'  },
  { label: '3M',  range: '3mo', interval: '1d'  },
  { label: 'YTD', range: 'ytd', interval: '1d'  },
  { label: '1Y',  range: '1y',  interval: '1d'  },
  { label: 'All', range: 'max', interval: '1mo' },
]

const isIntraday = (r) => r.interval === '60m'
const isMonthly  = (r) => r.interval === '1mo'

async function fetchStockHistory(symbol, range) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}` +
    `?range=${range.range}&interval=${range.interval}&includePrePost=false`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result) throw new Error(json.chart?.error?.description ?? 'No data returned')

  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.quote?.[0]?.close ?? []
  const intraday = isIntraday(range)

  return timestamps
    .map((ts, i) => ({
      date: intraday ? String(ts) : new Date(ts * 1000).toISOString().split('T')[0],
      value: closes[i],
    }))
    .filter((d) => d.value != null)
}

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const tickUsd = (v) => {
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function fmtTick(key, range) {
  if (isIntraday(range)) {
    return new Date(parseInt(key) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  }
  if (isMonthly(range)) {
    return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTip(key, range) {
  if (isIntraday(range)) {
    return new Date(parseInt(key) * 1000).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  }
  if (isMonthly(range)) {
    return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function CustomTooltip({ active, payload, label, range }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-500 mb-0.5">{fmtTip(label, range)}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{usd(payload[0].value)}</p>
    </div>
  )
}

export default function StockChart({ symbol }) {
  const { dark } = useTheme()
  const [range, setRange] = useState(RANGES[2]) // default 1M
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const tickColor = dark ? '#4b5563' : '#9ca3af'

  // Reset when switching to a different stock
  useEffect(() => {
    setRange(RANGES[2])
    setData([])
    setError(null)
  }, [symbol])

  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setLoading(true)
    setData([])
    setError(null)
    fetchStockHistory(symbol, range)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, range])

  const first = data[0]?.value ?? 0
  const last = data[data.length - 1]?.value ?? 0
  const pnl = last - first
  const pnlPct = first > 0 ? (pnl / first) * 100 : 0
  const isUp = pnl >= 0
  const stroke = isUp ? '#34d399' : '#f87171'
  const gradId = `sg-${symbol}-${isUp ? 'up' : 'dn'}`

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Price History</h3>
          {data.length > 1 && (
            <span className={`text-xs font-semibold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {isUp ? '+' : ''}{pnlPct.toFixed(2)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className={`text-xs px-1.5 py-0.5 rounded font-medium transition-colors ${
                range.label === r.label
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                  : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-36">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-gray-200 dark:border-gray-800 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center gap-1">
            <p className="text-xs text-gray-400 dark:text-gray-600">Could not load chart</p>
            <p className="text-xs text-gray-300 dark:text-gray-700 max-w-[220px] text-center">{error}</p>
          </div>
        ) : data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtTick(d, range)}
                tick={{ fill: tickColor, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={tickUsd}
                tick={{ fill: tickColor, fontSize: 9 }}
                axisLine={false}
                tickLine={false}
                width={44}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip range={range} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={1.5}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 3, fill: stroke, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-300 dark:text-gray-700 text-xs">
            No data available for this range
          </div>
        )}
      </div>
    </div>
  )
}
