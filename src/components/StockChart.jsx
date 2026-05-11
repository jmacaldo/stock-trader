import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useStore } from '../store'
import { useTheme } from '../useTheme'

const getNow = () => Math.floor(Date.now() / 1000)

const RANGES = [
  { label: '1D',  resolution: '60', getFrom: () => getNow() - 2 * 86400,                                                          sliceCount: 8    },
  { label: '1W',  resolution: 'D',  getFrom: () => getNow() - 10 * 86400,                                                         sliceCount: 5    },
  { label: '1M',  resolution: 'D',  getFrom: () => getNow() - 45 * 86400,                                                         sliceCount: 30   },
  { label: '3M',  resolution: 'D',  getFrom: () => getNow() - 135 * 86400,                                                        sliceCount: 90   },
  { label: 'YTD', resolution: 'D',  getFrom: () => Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000),          sliceCount: 9999 },
  { label: '1Y',  resolution: 'D',  getFrom: () => getNow() - 370 * 86400,                                                        sliceCount: 252  },
  { label: 'All', resolution: 'M',  getFrom: () => getNow() - 7300 * 86400,                                                       sliceCount: 9999 },
]

async function fetchStockHistory(symbol, apiKey, range) {
  const to = getNow()
  const from = range.getFrom()
  const res = await fetch(
    `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=${range.resolution}&from=${from}&to=${to}&token=${apiKey}`
  )
  const data = await res.json()
  if (data.s !== 'ok' || !data.t) return []

  const isIntraday = range.resolution === '60'
  const points = data.t.map((ts, i) => ({
    date: isIntraday ? String(ts) : new Date(ts * 1000).toISOString().split('T')[0],
    value: data.c[i],
  }))

  return range.sliceCount < 9999 ? points.slice(-range.sliceCount) : points
}

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const tickUsd = (v) => {
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function fmtTick(key, range) {
  if (range.resolution === '60') {
    return new Date(parseInt(key) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  }
  if (range.resolution === 'M') {
    return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTip(key, range) {
  if (range.resolution === '60') {
    return new Date(parseInt(key) * 1000).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  }
  if (range.resolution === 'M') {
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
  const { apiKey } = useStore()
  const { dark } = useTheme()
  const [range, setRange] = useState(RANGES[0])
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const tickColor = dark ? '#4b5563' : '#9ca3af'

  useEffect(() => {
    if (!symbol || !apiKey) return
    let cancelled = false
    setLoading(true)
    setData([])
    fetchStockHistory(symbol, apiKey, range)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, apiKey, range])

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
            No data available
          </div>
        )}
      </div>
    </div>
  )
}
