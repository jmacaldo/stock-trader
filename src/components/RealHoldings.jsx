import { useState, useEffect } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase'
import { useStore } from '../store'
import { refreshPrices } from '../prices'
import { useTheme } from '../useTheme'
import { fetchQuote } from '../api'

const PROXY = `${SUPABASE_URL}/functions/v1/yahoo-chart`
const AUTH  = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

const RANGES = [
  { label: '1D', range: '1d',  interval: '60m' },
  { label: '1W', range: '5d',  interval: '1d'  },
  { label: '1M', range: '1mo', interval: '1d'  },
  { label: '3M', range: '3mo', interval: '1d'  },
  { label: '6M', range: '6mo', interval: '1d'  },
  { label: '1Y', range: '1y',  interval: '1d'  },
]

const isIntraday = (r) => r.interval === '60m'

const usd = (n) =>
  (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })

const tickUsd = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

async function fetchChartHistory(holdings, range) {
  const byKey = {}
  for (const { symbol, shares } of holdings) {
    try {
      const res = await fetch(
        `${PROXY}?symbol=${symbol}&range=${range.range}&interval=${range.interval}`,
        { headers: AUTH }
      )
      if (!res.ok) continue
      const json = await res.json()
      const result = json.chart?.result?.[0]
      if (!result) continue
      const timestamps = result.timestamp ?? []
      const closes = result.indicators?.quote?.[0]?.close ?? []
      const intraday = isIntraday(range)
      timestamps.forEach((ts, i) => {
        if (closes[i] == null) return
        const key = intraday ? String(ts) : new Date(ts * 1000).toISOString().split('T')[0]
        byKey[key] = (byKey[key] ?? 0) + closes[i] * shares
      })
    } catch {}
  }
  return Object.entries(byKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
    .filter((d) => d.value > 0)
}

function fmtTick(key, range) {
  if (isIntraday(range))
    return new Date(parseInt(key) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true })
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTip(key, range) {
  if (isIntraday(range))
    return new Date(parseInt(key) * 1000).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
    })
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function ChartTooltip({ active, payload, label, range }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 shadow-xl">
      <p className="text-xs text-gray-500 mb-1">{fmtTip(label, range)}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{usd(payload[0].value)}</p>
    </div>
  )
}

const EMPTY_FORM = { symbol: '', shares: '', cash: '' }

export default function RealHoldings({ onSummaryChange }) {
  const { userId } = useStore()
  const { dark } = useTheme()
  const [holdings, setHoldings]       = useState([])
  const [prices, setPrices]           = useState({})
  const [pricesAsOf, setPricesAsOf]   = useState(null)
  const [chartData, setChartData]     = useState([])
  const [chartRange, setChartRange]   = useState(RANGES[2]) // default 1M
  const [chartLoading, setChartLoading] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editingSymbol, setEditingSymbol] = useState(null)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [submitting, setSubmitting]   = useState(false)
  const [formError, setFormError]     = useState(null)
  const [deleting, setDeleting]       = useState(null)
  const tickColor = dark ? '#4b5563' : '#9ca3af'

  // Load from DB
  useEffect(() => {
    if (!userId) return
    supabase
      .from('real_holdings')
      .select('*')
      .eq('user_id', userId)
      .then(({ data }) => {
        setHoldings((data ?? []).map((r) => ({
          symbol: r.symbol,
          name: r.name ?? null,
          shares: parseFloat(r.shares),
          cashInvested: parseFloat(r.cash_invested),
        })))
        setLoading(false)
      })
  }, [userId])

  // Refresh prices every 30s
  const symbolsKey = holdings.map((h) => h.symbol).join(',')
  useEffect(() => {
    const symbols = holdings.map((h) => h.symbol)
    if (!symbols.length) return
    const load = () => refreshPrices(symbols).then(({ prices, asOf }) => {
      setPrices(prices)
      setPricesAsOf(asOf)
    })
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [symbolsKey])

  // Fetch chart whenever holdings or range changes
  const holdingsKey = holdings.map((h) => `${h.symbol}:${h.shares}`).join(',')
  useEffect(() => {
    if (!holdings.length) { setChartData([]); return }
    let cancelled = false
    setChartLoading(true)
    fetchChartHistory(holdings, chartRange)
      .then((d) => { if (!cancelled) setChartData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChartLoading(false) })
    return () => { cancelled = true }
  }, [holdingsKey, chartRange])

  const openAdd = () => {
    setEditingSymbol(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (h) => {
    setEditingSymbol(h.symbol)
    setForm({ symbol: h.symbol, shares: String(h.shares), cash: String(h.cashInvested) })
    setFormError(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingSymbol(null)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const symbol = form.symbol.trim().toUpperCase()
    const shares = parseFloat(form.shares)
    const cash   = parseFloat(form.cash)
    if (!symbol || !(shares > 0) || !(cash > 0)) {
      setFormError('Fill in all fields with valid positive values.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const quote = await fetchQuote(symbol)
      const name  = quote.shortName ?? symbol
      await supabase.from('real_holdings').upsert(
        { user_id: userId, symbol, name, shares, cash_invested: cash },
        { onConflict: 'user_id,symbol' }
      )
      setHoldings((prev) => {
        const rest = prev.filter((h) => h.symbol !== symbol)
        return [...rest, { symbol, name, shares, cashInvested: cash }]
      })
      closeForm()
    } catch {
      setFormError('Invalid symbol or could not save. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (symbol) => {
    setDeleting(symbol)
    await supabase.from('real_holdings').delete().match({ user_id: userId, symbol })
    setHoldings((prev) => prev.filter((h) => h.symbol !== symbol))
    setDeleting(null)
  }

  // Derived values
  const rows = holdings.map((h) => {
    const price = prices[h.symbol] ?? null
    const value = price != null ? price * h.shares : null
    const gain  = value != null ? value - h.cashInvested : null
    const gainPct = gain != null && h.cashInvested > 0 ? (gain / h.cashInvested) * 100 : null
    return { ...h, price, value, gain, gainPct }
  })

  const totalInvested  = rows.reduce((s, r) => s + r.cashInvested, 0)
  const totalValue     = rows.reduce((s, r) => s + (r.value ?? r.cashInvested), 0)
  const totalGain      = totalValue - totalInvested
  const totalGainPct   = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0
  const totalIsUp      = totalGain >= 0

  useEffect(() => {
    onSummaryChange?.({ totalValue, totalGain, totalGainPct, totalInvested })
  }, [totalValue, totalGain, totalGainPct, totalInvested])

  const first      = chartData[0]?.value ?? 0
  const last       = chartData[chartData.length - 1]?.value ?? 0
  const chartPnl   = last - first
  const chartPnlPct = first > 0 ? (chartPnl / first) * 100 : 0
  const chartIsUp  = chartPnl >= 0
  const stroke     = totalIsUp ? '#34d399' : '#f87171'
  const gradId     = `rh-${totalIsUp ? 'up' : 'dn'}`

  if (loading) return null

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Real Holdings</h2>
          {holdings.length > 0 && (
            <span className={`text-xs font-bold ${totalIsUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalIsUp ? '+' : ''}{usd(totalGain)} ({totalIsUp ? '+' : ''}{totalGainPct.toFixed(2)}%)
            </span>
          )}
          {pricesAsOf && (
            <span className="text-xs text-gray-300 dark:text-gray-700">
              as of {pricesAsOf.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={showForm ? closeForm : openAdd}
          className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Holding'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[90px]">
              <label className="block text-xs text-gray-500 mb-1">Symbol</label>
              <input
                value={form.symbol}
                onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                disabled={!!editingSymbol}
                placeholder="AAPL"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder-gray-400 disabled:opacity-50"
              />
            </div>
            <div className="flex-1 min-w-[90px]">
              <label className="block text-xs text-gray-500 mb-1">Shares</label>
              <input
                type="number" min="0" step="any"
                value={form.shares}
                onChange={(e) => setForm((f) => ({ ...f, shares: e.target.value }))}
                placeholder="10"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder-gray-400"
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs text-gray-500 mb-1">Cash Invested ($)</label>
              <input
                type="number" min="0" step="any"
                value={form.cash}
                onChange={(e) => setForm((f) => ({ ...f, cash: e.target.value }))}
                placeholder="1500.00"
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors placeholder-gray-400"
              />
            </div>
            <button
              type="submit" disabled={submitting}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
            >
              {submitting ? 'Saving…' : editingSymbol ? 'Update' : 'Add'}
            </button>
          </div>
          {formError && <p className="text-xs text-red-500 mt-2">{formError}</p>}
        </form>
      )}

      {/* Empty state */}
      {!holdings.length && (
        <div className="py-10 text-center">
          <p className="text-gray-400 dark:text-gray-600 text-sm">No real holdings yet</p>
          <p className="text-gray-300 dark:text-gray-700 text-xs mt-1">Add a holding to start tracking your real portfolio</p>
        </div>
      )}

      {/* Performance chart — shown above table */}
      {holdings.length > 0 && (chartLoading || chartData.length > 1) && (
        <div className="border-b border-gray-100 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Real Performance</h3>
              {chartData.length > 1 && (
                <span className={`text-xs font-semibold ${chartIsUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {chartPnl >= 0 ? '+' : ''}{usd(chartPnl)} ({chartPnlPct >= 0 ? '+' : ''}{chartPnlPct.toFixed(2)}%)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => setChartRange(r)}
                  className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                    chartRange.label === r.label
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-44">
            {chartLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-gray-200 dark:border-gray-800 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => fmtTick(d, chartRange)}
                    tick={{ fill: tickColor, fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tickFormatter={tickUsd}
                    tick={{ fill: tickColor, fontSize: 10 }}
                    axisLine={false} tickLine={false}
                    width={48} domain={['auto', 'auto']}
                  />
                  <Tooltip content={<ChartTooltip range={chartRange} />} />
                  <Area
                    type="monotone" dataKey="value"
                    stroke={stroke} strokeWidth={2}
                    fill={`url(#${gradId})`}
                    dot={false} activeDot={{ r: 4, fill: stroke, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {holdings.length > 0 && (
        <>
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm min-w-[580px]">
              <thead>
                <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800/50">
                  <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                  <th className="text-right px-4 py-2.5 font-medium">Shares</th>
                  <th className="text-right px-4 py-2.5 font-medium">Avg Cost</th>
                  <th className="text-right px-4 py-2.5 font-medium">Price</th>
                  <th className="text-right px-4 py-2.5 font-medium">Value</th>
                  <th className="text-right px-4 py-2.5 font-medium">Gain / Loss</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const up  = (r.gain ?? 0) >= 0
                  const clr = up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  return (
                    <tr key={r.symbol} className="border-t border-gray-100 dark:border-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-gray-900 dark:text-white text-sm">{r.symbol}</div>
                        {r.name && <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[130px]">{r.name}</div>}
                      </td>
                      <td className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">
                        {r.shares < 1 ? r.shares.toFixed(6) : r.shares.toFixed(4)}
                      </td>
                      <td className="text-right px-4 py-3 text-gray-400 dark:text-gray-500 tabular-nums text-xs">
                        {usd(r.cashInvested / r.shares)}
                      </td>
                      <td className="text-right px-4 py-3 text-gray-700 dark:text-gray-200 tabular-nums font-medium">
                        {r.price != null ? usd(r.price) : '—'}
                      </td>
                      <td className="text-right px-4 py-3 text-gray-900 dark:text-white tabular-nums font-semibold">
                        {r.value != null ? usd(r.value) : '—'}
                      </td>
                      <td className="text-right px-4 py-3">
                        {r.gain != null ? (
                          <>
                            <div className={`font-semibold tabular-nums ${clr}`}>
                              {r.gain >= 0 ? '+' : ''}{usd(r.gain)}
                            </div>
                            <div className={`text-xs ${clr}`}>
                              {r.gainPct >= 0 ? '+' : ''}{r.gainPct.toFixed(2)}%
                            </div>
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(r.symbol)}
                            disabled={deleting === r.symbol}
                            className="text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Remove"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
                  <td colSpan={4} className="px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                    Total · {usd(totalInvested)} invested
                  </td>
                  <td className="text-right px-4 py-2.5 text-gray-900 dark:text-white font-bold tabular-nums">
                    {usd(totalValue)}
                  </td>
                  <td className={`text-right px-4 py-2.5 font-bold tabular-nums ${totalIsUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    <div>{totalIsUp ? '+' : ''}{usd(totalGain)}</div>
                    <div className="text-xs">{totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(2)}%</div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

        </>
      )}
    </div>
  )
}
