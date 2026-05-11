import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useStore } from '../store'
import { useTheme } from '../useTheme'

const RANGES = [
  { label: '1D', resolution: '60', windowDays: 2,   sliceCount: 8   },
  { label: '1W', resolution: 'D',  windowDays: 10,  sliceCount: 5   },
  { label: '1M', resolution: 'D',  windowDays: 45,  sliceCount: 30  },
  { label: '3M', resolution: 'D',  windowDays: 135, sliceCount: 90  },
  { label: '6M', resolution: 'D',  windowDays: 270, sliceCount: 180 },
]

async function fetchHistory(portfolio, apiKey, range) {
  const symbols = Object.keys(portfolio)
  const to = Math.floor(Date.now() / 1000)
  const from = to - range.windowDays * 24 * 60 * 60
  const { resolution, sliceCount } = range

  const results = await Promise.all(
    symbols.map(async (sym) => {
      const res = await fetch(
        `https://finnhub.io/api/v1/stock/candle?symbol=${sym}&resolution=${resolution}&from=${from}&to=${to}&token=${apiKey}`
      )
      const data = await res.json()
      return { sym, data }
    })
  )

  // For daily: key = 'YYYY-MM-DD'. For intraday: key = unix timestamp string.
  const byKey = {}
  results.forEach(({ sym, data }) => {
    if (data.s !== 'ok' || !data.t) return
    data.t.forEach((ts, i) => {
      const key = resolution === 'D'
        ? new Date(ts * 1000).toISOString().split('T')[0]
        : String(ts)
      if (!byKey[key]) byKey[key] = {}
      byKey[key][sym] = data.c[i]
    })
  })

  return Object.entries(byKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-sliceCount)
    .map(([key, prices]) => ({
      date: key,
      value: symbols.reduce((sum, sym) => {
        const price = prices[sym]
        const shares = portfolio[sym]?.shares ?? 0
        return price ? sum + shares * price : sum
      }, 0),
    }))
    .filter((d) => d.value > 0)
}

const usd = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const tickUsd = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

function fmtTick(key, isIntraday) {
  if (isIntraday) {
    return new Date(parseInt(key) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  }
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTip(key, isIntraday) {
  if (isIntraday) {
    return new Date(parseInt(key) * 1000).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    })
  }
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function CustomTooltip({ active, payload, label, isIntraday }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 shadow-xl">
      <p className="text-xs text-gray-500 mb-1">{fmtTip(label, isIntraday)}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{usd(payload[0].value)}</p>
    </div>
  )
}

export default function PortfolioChart() {
  const { portfolio, apiKey } = useStore()
  const { dark } = useTheme()
  const [range, setRange] = useState(RANGES[2])
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const symbols = Object.keys(portfolio)
  const tickColor = dark ? '#4b5563' : '#9ca3af'
  const isIntraday = range.resolution !== 'D'

  useEffect(() => {
    if (!symbols.length || !apiKey) { setData([]); return }

    let cancelled = false
    setLoading(true)
    fetchHistory(portfolio, apiKey, range)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [symbols.join(','), apiKey, range])

  if (!symbols.length) return null

  const first = data[0]?.value ?? 0
  const last = data[data.length - 1]?.value ?? 0
  const pnl = last - first
  const pnlPct = first > 0 ? (pnl / first) * 100 : 0
  const isUp = pnl >= 0
  const stroke = isUp ? '#34d399' : '#f87171'
  const gradId = `grad-${isUp ? 'up' : 'down'}`

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Holdings Performance
        </h2>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r)}
              className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
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

      {data.length > 1 && (
        <div className="mb-3">
          <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{usd(last)}</span>
          <span className={`ml-2 text-sm font-semibold ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {isUp ? '+' : ''}{usd(pnl)} ({isUp ? '+' : ''}{pnlPct.toFixed(2)}%)
          </span>
        </div>
      )}

      <div className="h-44">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-gray-200 dark:border-gray-800 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtTick(d, isIntraday)}
                tick={{ fill: tickColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={tickUsd}
                tick={{ fill: tickColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<CustomTooltip isIntraday={isIntraday} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={false}
                activeDot={{ r: 4, fill: stroke, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-300 dark:text-gray-700 text-sm">
            Not enough data yet
          </div>
        )}
      </div>
    </div>
  )
}
