import { useState, useEffect } from 'react'
import { formatAge, useNow } from '../time'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase'
import { useStore } from '../store'
import { refreshPrices } from '../prices'
import { useTheme } from '../useTheme'
import { fetchQuote } from '../api'

const PROXY       = `${SUPABASE_URL}/functions/v1/yahoo-chart`
const QUOTES_URL  = `${SUPABASE_URL}/functions/v1/yahoo-quotes`
const AUTH        = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

async function fetchEnrichedQuotes(symbols) {
  if (!symbols.length) return {}
  try {
    const res = await fetch(`${QUOTES_URL}?symbols=${symbols.join(',')}`, { headers: AUTH })
    if (!res.ok) return Object.fromEntries(symbols.map((s) => [s, null]))
    const { quotes } = await res.json()
    const result = Object.fromEntries((quotes ?? []).map((q) => [q.symbol, q]))
    // Mark any symbol not returned as null (not undefined) so we know the fetch finished
    for (const s of symbols) if (!(s in result)) result[s] = null
    return result
  } catch {
    return Object.fromEntries(symbols.map((s) => [s, null]))
  }
}

function computeHoldingSignal(q, { netInvested, netShares }) {
  if (!q || !netShares || netShares < 0.000001) return null

  const {
    regularMarketPrice, regularMarketChangePercent,
    regularMarketVolume, averageDailyVolume3Month,
    regularMarketDayHigh, regularMarketDayLow,
    fiftyTwoWeekHigh, fiftyTwoWeekLow,
  } = q

  if (!averageDailyVolume3Month || !regularMarketDayHigh || !regularMarketDayLow) return null

  const relVol       = regularMarketVolume / averageDailyVolume3Month
  const dayRange     = regularMarketDayHigh - regularMarketDayLow
  const intradayPos  = dayRange > 0 ? (regularMarketPrice - regularMarketDayLow) / dayRange : 0.5
  const fiftyTwoRange = (fiftyTwoWeekHigh ?? 0) - (fiftyTwoWeekLow ?? 0)
  const fiftyTwoPos  = fiftyTwoRange > 0 ? (regularMarketPrice - fiftyTwoWeekLow) / fiftyTwoRange : 0.5
  const changePct    = regularMarketChangePercent ?? 0

  const averageCost  = netInvested / netShares
  const currentValue = regularMarketPrice * netShares
  const totalReturn  = netInvested > 0 ? ((currentValue - netInvested) / netInvested) * 100 : 0

  let confidence
  if (relVol >= 3.0 && (intradayPos > 0.75 || intradayPos < 0.25)) confidence = 'high'
  else if (relVol >= 2.0 && (intradayPos >= 0.65 || intradayPos <= 0.35)) confidence = 'medium'
  else confidence = 'low'

  let signal, reason

  // SELL — any condition true
  if ((intradayPos <= 0.35 && relVol >= 2.0) || totalReturn <= -15 || (fiftyTwoPos <= 0.15 && changePct < 0)) {
    signal = 'SELL'
    if (totalReturn <= -15)
      reason = `Position is down ${Math.abs(totalReturn).toFixed(1)}% from cost basis — thesis needs re-evaluation.`
    else if (fiftyTwoPos <= 0.15 && changePct < 0)
      reason = `Trading near 52-week lows with continued selling pressure.`
    else
      reason = `High-volume fade at day lows suggests distribution; avg cost ${usd(averageCost)}.`
  }
  // TRIM
  else if ((totalReturn >= 30 && intradayPos <= 0.50) || (fiftyTwoPos >= 0.90 && intradayPos <= 0.40)) {
    signal = 'TRIM'
    if (totalReturn >= 30 && intradayPos <= 0.50)
      reason = `Up ${totalReturn.toFixed(1)}% from cost — consider locking in partial gains on today's weakness.`
    else
      reason = `Near 52-week highs but fading today; consider trimming into strength.`
  }
  // ADD
  else if (relVol >= 2.0 && intradayPos >= 0.65 && changePct > 0 && totalReturn > -5) {
    signal = 'ADD'
    reason = `Holding near day highs on ${relVol.toFixed(1)}× volume; avg cost ${usd(averageCost)}.`
  }
  // WATCH — notable activity but mixed
  else if (relVol >= 2.0 || Math.abs(changePct) > 3) {
    signal = 'WATCH'
    confidence = 'low'
    reason = `Notable activity (${relVol.toFixed(1)}× vol, ${changePct >= 0 ? '+' : ''}${changePct.toFixed(1)}% today) but no clear directional read.`
  }
  // HOLD
  else {
    signal = 'HOLD'
    confidence = 'low'
    reason = `No unusual volume or directional pressure; position at ${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}% from cost.`
  }

  return {
    signal, confidence, reason,
    relativeVolume:       parseFloat(relVol.toFixed(2)),
    intradayPosition:     parseFloat(intradayPos.toFixed(2)),
    fiftyTwoWeekPosition: parseFloat(fiftyTwoPos.toFixed(2)),
    totalReturn:          parseFloat(totalReturn.toFixed(1)),
  }
}

const SIGNAL_STYLES = {
  ADD:  { badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400', bar: 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400' },
  HOLD: { badge: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',               bar: 'bg-gray-50 dark:bg-gray-800/30 text-gray-500 dark:text-gray-400' },
  SELL: { badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',                bar: 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400' },
  TRIM: { badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',        bar: 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400' },
  WATCH:{ badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',            bar: 'bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400' },
}

const CONFIDENCE_LABEL = { high: '●●●', medium: '●●○', low: '●○○' }

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
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}k`
  return `$${v.toFixed(2)}`
}

async function fetchChartHistory(positions, range) {
  const byKey = {}
  for (const { symbol, shares } of positions) {
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

const today = () => new Date().toISOString().split('T')[0]
const EMPTY_FORM = { symbol: '', shares: '', cash: '', date: today(), type: 'buy' }

export default function RealHoldings({ onSummaryChange }) {
  useNow()
  const { userId } = useStore()
  const { dark } = useTheme()
  const [transactions, setTransactions]     = useState([])
  const [prices, setPrices]                 = useState({})
  const [pricesAsOf, setPricesAsOf]         = useState(null)
  const [chartData, setChartData]           = useState([])
  const [chartRange, setChartRange]         = useState(RANGES[2])
  const [chartLoading, setChartLoading]     = useState(false)
  const [loading, setLoading]               = useState(true)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [showForm, setShowForm]             = useState(false)
  const [editingId, setEditingId]           = useState(null)
  const [form, setForm]                     = useState(EMPTY_FORM)
  const [submitting, setSubmitting]         = useState(false)
  const [formError, setFormError]           = useState(null)
  const [deleting, setDeleting]             = useState(null)
  const [enrichedData, setEnrichedData]     = useState({})
  const tickColor = dark ? '#4b5563' : '#9ca3af'

  // Load all transactions from DB
  useEffect(() => {
    if (!userId) return
    supabase
      .from('real_holdings')
      .select('*')
      .eq('user_id', userId)
      .order('activity_date', { ascending: false })
      .then(({ data }) => {
        setTransactions((data ?? []).map((r) => ({
          id: r.id,
          symbol: r.symbol,
          name: r.name ?? null,
          shares: parseFloat(r.shares),
          cashInvested: parseFloat(r.cash_invested),
          date: r.activity_date,
          type: r.activity_type ?? 'buy',
        })))
        setLoading(false)
      })
  }, [userId])

  // Aggregate net positions per symbol (buys - sells)
  const positionMap = {}
  for (const t of transactions) {
    if (!positionMap[t.symbol]) positionMap[t.symbol] = { shares: 0, name: t.name, netInvested: 0 }
    if (t.type === 'buy') { positionMap[t.symbol].shares += t.shares; positionMap[t.symbol].netInvested += t.cashInvested }
    else                  { positionMap[t.symbol].shares -= t.shares; positionMap[t.symbol].netInvested -= t.cashInvested }
  }
  const activePositions = Object.entries(positionMap)
    .filter(([, p]) => p.shares > 0.000001)
    .map(([symbol, p]) => ({ symbol, shares: p.shares, name: p.name }))

  // Pre-compute signals for all active positions
  const positionSignals = {}
  for (const [symbol, pos] of Object.entries(positionMap)) {
    if (pos.shares > 0.000001 && enrichedData[symbol]) {
      positionSignals[symbol] = computeHoldingSignal(enrichedData[symbol], {
        netInvested: pos.netInvested,
        netShares: pos.shares,
      })
    }
  }

  // Refresh prices every 30s using net positions
  const symbolsKey = activePositions.map((p) => p.symbol).sort().join(',')
  useEffect(() => {
    const symbols = activePositions.map((p) => p.symbol)
    if (!symbols.length) { setPrices({}); setPricesAsOf(null); return }
    const load = () => refreshPrices(symbols).then(({ prices, asOf }) => {
      setPrices(prices)
      setPricesAsOf(asOf)
    })
    load()
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [symbolsKey])

  // Fetch enriched signal data (volume, 52wk range, etc.) — refresh every 5 min
  useEffect(() => {
    const symbols = activePositions.map((p) => p.symbol)
    if (!symbols.length) { setEnrichedData({}); return }
    fetchEnrichedQuotes(symbols).then(setEnrichedData)
    const t = setInterval(() => fetchEnrichedQuotes(symbols).then(setEnrichedData), 300_000)
    return () => clearInterval(t)
  }, [symbolsKey])

  // Fetch chart whenever net positions or range changes
  const holdingsKey = activePositions.map((p) => `${p.symbol}:${p.shares.toFixed(6)}`).join(',')
  useEffect(() => {
    if (!activePositions.length) { setChartData([]); return }
    let cancelled = false
    setChartLoading(true)
    fetchChartHistory(activePositions, chartRange)
      .then((d) => { if (!cancelled) setChartData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChartLoading(false) })
    return () => { cancelled = true }
  }, [holdingsKey, chartRange])

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, date: today() })
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (tx) => {
    setEditingId(tx.id)
    setForm({ symbol: tx.symbol, shares: String(tx.shares), cash: String(tx.cashInvested), date: tx.date, type: tx.type })
    setFormError(null)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const symbol = form.symbol.trim().toUpperCase()
    const shares = parseFloat(form.shares)
    const cash   = parseFloat(form.cash)
    if (!symbol || !(shares > 0) || !(cash > 0) || !form.date) {
      setFormError('Fill in all fields with valid positive values.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      if (editingId) {
        const name = transactions.find((t) => t.id === editingId)?.name ?? symbol
        await supabase.from('real_holdings').update({
          symbol, name, shares, cash_invested: cash,
          activity_date: form.date, activity_type: form.type,
        }).eq('id', editingId)
        setTransactions((prev) => prev.map((t) =>
          t.id === editingId
            ? { ...t, symbol, name, shares, cashInvested: cash, date: form.date, type: form.type }
            : t
        ))
      } else {
        const quote = await fetchQuote(symbol)
        const name  = quote.shortName ?? symbol
        const { data, error } = await supabase.from('real_holdings').insert({
          user_id: userId, symbol, name, shares, cash_invested: cash,
          activity_date: form.date, activity_type: form.type,
        }).select().single()
        if (error) throw error
        setTransactions((prev) => [
          { id: data.id, symbol, name, shares, cashInvested: cash, date: form.date, type: form.type },
          ...prev,
        ])
      }
      closeForm()
    } catch {
      setFormError('Invalid symbol or could not save. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    setDeleting(id)
    await supabase.from('real_holdings').delete().eq('id', id)
    setTransactions((prev) => prev.filter((t) => t.id !== id))
    setDeleting(null)
  }

  // Totals: buys add, sells subtract
  const totalInvested = transactions.reduce((s, t) =>
    t.type === 'buy' ? s + t.cashInvested : s - t.cashInvested, 0)
  const totalValue = activePositions.reduce((s, p) =>
    s + (prices[p.symbol] != null ? prices[p.symbol] * p.shares : 0), 0)
  const totalGain    = totalValue - totalInvested
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0
  const totalIsUp    = totalGain >= 0

  const first       = chartData[0]?.value ?? 0
  const last        = chartData[chartData.length - 1]?.value ?? 0
  const chartPnl    = last - first
  const chartPnlPct = first > 0 ? (chartPnl / first) * 100 : 0
  const chartIsUp   = chartPnl >= 0
  const stroke      = totalIsUp ? '#34d399' : '#f87171'
  const gradId      = `rh-${totalIsUp ? 'up' : 'dn'}`

  useEffect(() => {
    onSummaryChange?.({ totalValue, totalGain, totalGainPct, totalInvested })
  }, [totalValue, totalGain, totalGainPct, totalInvested])

  if (loading) return null

  const sortedTx = [...transactions].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Real Holdings</h2>
          {transactions.length > 0 && (
            <span className={`text-xs font-bold ${totalIsUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {totalIsUp ? '+' : ''}{usd(totalGain)} ({totalIsUp ? '+' : ''}{totalGainPct.toFixed(2)}%)
            </span>
          )}
          {pricesAsOf && (
            <span className="text-xs text-gray-300 dark:text-gray-700">
              {formatAge(pricesAsOf)}
            </span>
          )}
        </div>
        <button
          onClick={showForm ? closeForm : openAdd}
          className="text-xs px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-lg font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ Add Entry'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
          <div className="flex gap-1.5 mb-3">
            {['buy', 'sell'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
                  form.type === t
                    ? t === 'buy' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="flex-1 min-w-[90px]">
              <label className="block text-xs text-gray-500 mb-1">Symbol</label>
              <input
                value={form.symbol}
                onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                disabled={!!editingId}
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
            <div className="flex-1 min-w-[130px]">
              <label className="block text-xs text-gray-500 mb-1">
                {form.type === 'buy' ? 'Cash Invested ($)' : 'Cash Received ($)'}
              </label>
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
              {submitting ? 'Saving…' : editingId ? 'Update' : 'Add'}
            </button>
          </div>
          {formError && <p className="text-xs text-red-500 mt-2">{formError}</p>}
        </form>
      )}

      {/* Empty state */}
      {!transactions.length && (
        <div className="py-10 text-center">
          <p className="text-gray-400 dark:text-gray-600 text-sm">No entries yet</p>
          <p className="text-gray-300 dark:text-gray-700 text-xs mt-1">Add a buy or sell entry to start tracking</p>
        </div>
      )}

      {/* Performance chart */}
      {activePositions.length > 0 && (chartLoading || chartData.length > 1) && (
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
                    width={60} domain={['auto', 'auto']} tickCount={8}
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

      {/* Transaction table */}
      {transactions.length > 0 && (
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-sm min-w-[1020px]">
            <thead>
              <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800/50">
                <th className="text-left px-4 py-2.5 font-medium">Date</th>
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Symbol</th>
                <th className="text-right px-4 py-2.5 font-medium">Shares</th>
                <th className="text-right px-4 py-2.5 font-medium">Price Paid</th>
                <th className="text-right px-4 py-2.5 font-medium">Live Price</th>
                <th className="text-right px-4 py-2.5 font-medium">Δ Price</th>
                <th className="text-right px-4 py-2.5 font-medium">Cash Paid</th>
                <th className="text-right px-4 py-2.5 font-medium">Live Value</th>
                <th className="text-right px-4 py-2.5 font-medium">P&amp;L</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sortedTx.map((tx) => (
                <tr key={tx.id} className="border-t border-gray-100 dark:border-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                    {new Date(tx.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                      tx.type === 'buy'
                        ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedSymbol(tx.symbol)} className="text-left group">
                      <div className="flex items-center gap-1.5">
                        <div className="font-mono font-bold text-gray-900 dark:text-white text-sm group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{tx.symbol}</div>
                        {positionSignals[tx.symbol] && (() => {
                          const sig = positionSignals[tx.symbol]
                          return (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${SIGNAL_STYLES[sig.signal].badge}`}>
                              {sig.signal}
                            </span>
                          )
                        })()}
                      </div>
                      {tx.name && <div className="text-xs text-gray-400 dark:text-gray-600 truncate max-w-[130px]">{tx.name}</div>}
                    </button>
                  </td>
                  <td className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">
                    {tx.shares < 1 ? tx.shares.toFixed(6) : tx.shares.toFixed(4)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums text-sm text-gray-500 dark:text-gray-400">
                    {usd(tx.cashInvested / tx.shares)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums text-sm text-gray-700 dark:text-gray-200">
                    {prices[tx.symbol] != null
                      ? usd(prices[tx.symbol])
                      : <span className="text-gray-300 dark:text-gray-700">—</span>}
                  </td>
                  {(() => {
                    const pricePaid = tx.cashInvested / tx.shares
                    const livePrice = prices[tx.symbol]
                    if (livePrice == null) {
                      return <td className="text-right px-4 py-3 text-gray-300 dark:text-gray-700 tabular-nums text-sm">—</td>
                    }
                    const delta = livePrice - pricePaid
                    const deltaPct = (delta / pricePaid) * 100
                    return (
                      <td className={`text-right px-4 py-3 tabular-nums text-sm font-medium ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        <div>{delta >= 0 ? '+' : ''}{usd(delta)}</div>
                        <div className="text-xs opacity-70">{deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%</div>
                      </td>
                    )
                  })()}
                  <td className={`text-right px-4 py-3 tabular-nums font-medium ${
                    tx.type === 'sell' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                  }`}>
                    {tx.type === 'sell' ? '-' : ''}{usd(tx.cashInvested)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums text-sm text-gray-700 dark:text-gray-200 font-medium">
                    {tx.type === 'buy' && prices[tx.symbol] != null
                      ? usd(tx.shares * prices[tx.symbol])
                      : <span className="text-gray-300 dark:text-gray-700">—</span>}
                  </td>
                  {(() => {
                    if (tx.type !== 'buy' || prices[tx.symbol] == null) {
                      return <td className="text-right px-4 py-3 text-gray-300 dark:text-gray-700 tabular-nums text-sm">—</td>
                    }
                    const txPnl = tx.shares * prices[tx.symbol] - tx.cashInvested
                    const txPnlPct = tx.cashInvested > 0 ? (txPnl / tx.cashInvested) * 100 : 0
                    return (
                      <td className={`text-right px-4 py-3 tabular-nums text-sm font-medium ${txPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        <div>{txPnl >= 0 ? '+' : ''}{usd(txPnl)}</div>
                        <div className="text-xs opacity-70">{txPnlPct >= 0 ? '+' : ''}{txPnlPct.toFixed(2)}%</div>
                      </td>
                    )
                  })()}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(tx)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" title="Edit">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(tx.id)}
                        disabled={deleting === tx.id}
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
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
                <td colSpan={7} className="px-4 py-2.5 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                  Total · {activePositions.length} position{activePositions.length !== 1 ? 's' : ''}
                </td>
                <td className="text-right px-4 py-2.5 text-gray-700 dark:text-gray-300 font-bold tabular-nums text-sm">
                  {usd(totalInvested)}
                </td>
                <td className="text-right px-4 py-2.5 text-gray-900 dark:text-white font-bold tabular-nums text-sm">
                  {totalValue > 0 ? usd(totalValue) : '—'}
                </td>
                <td className={`text-right px-4 py-2.5 font-bold tabular-nums text-sm ${totalIsUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {totalValue > 0 ? (
                    <>
                      <div>{totalIsUp ? '+' : ''}{usd(totalGain)}</div>
                      <div className="text-xs font-medium opacity-70">{totalGainPct >= 0 ? '+' : ''}{totalGainPct.toFixed(2)}%</div>
                    </>
                  ) : '—'}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Symbol detail modal */}
      {selectedSymbol && (() => {
        const symTx = [...transactions]
          .filter((t) => t.symbol === selectedSymbol)
          .sort((a, b) => b.date.localeCompare(a.date))
        const symName = symTx[0]?.name ?? selectedSymbol
        const netShares = symTx.reduce((s, t) => t.type === 'buy' ? s + t.shares : s - t.shares, 0)
        const netInvested = symTx.reduce((s, t) => t.type === 'buy' ? s + t.cashInvested : s - t.cashInvested, 0)
        const currentPrice = prices[selectedSymbol] ?? null
        const currentValue = currentPrice != null ? currentPrice * Math.max(netShares, 0) : null
        const pnl = currentValue != null ? currentValue - netInvested : null
        const pnlPct = pnl != null && netInvested > 0 ? (pnl / netInvested) * 100 : null
        const isUp = (pnl ?? 0) >= 0
        const signal = positionSignals[selectedSymbol] ?? null
        const sigStyle = signal ? SIGNAL_STYLES[signal.signal] : null

        return (
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedSymbol(null) }}
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 dark:border-gray-700 max-h-[85vh] flex flex-col">
              {/* Modal header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white font-mono">{selectedSymbol}</h2>
                    {pnl != null && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${isUp ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                        {isUp ? '+' : ''}{usd(pnl)}
                      </span>
                    )}
                  </div>
                  {symName !== selectedSymbol && <p className="text-xs text-gray-400 mt-0.5">{symName}</p>}
                </div>
                <button onClick={() => setSelectedSymbol(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-px bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
                {[
                  { label: 'Net Shares', value: netShares > 0.000001 ? (netShares < 1 ? netShares.toFixed(6) : netShares.toFixed(4)) : '0' },
                  { label: 'Net Invested', value: usd(netInvested) },
                  { label: 'Current Value', value: currentValue != null ? usd(currentValue) : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white dark:bg-gray-900 px-4 py-3">
                    <p className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              {/* P&L bar */}
              {pnl != null && (
                <div className={`px-5 py-2.5 text-sm font-semibold flex items-center justify-between ${isUp ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400'}`}>
                  <span>Total P&amp;L</span>
                  <span className="tabular-nums">
                    {isUp ? '+' : ''}{usd(pnl)}
                    {pnlPct != null && <span className="ml-2 text-xs opacity-75">({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)</span>}
                  </span>
                </div>
              )}

              {/* Signal */}
              {signal && sigStyle && (
                <div className={`px-5 py-3 border-b border-gray-100 dark:border-gray-800 ${sigStyle.bar}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold ${sigStyle.badge}`}>{signal.signal}</span>
                      <span className="text-xs opacity-60" title={`Confidence: ${signal.confidence}`}>{CONFIDENCE_LABEL[signal.confidence]}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs opacity-70 tabular-nums">
                      <span title="Relative volume">{signal.relativeVolume}× vol</span>
                      <span title="Intraday position">{(signal.intradayPosition * 100).toFixed(0)}% of range</span>
                      <span title="52-week position">{(signal.fiftyTwoWeekPosition * 100).toFixed(0)}% of 52wk</span>
                    </div>
                  </div>
                  <p className="text-xs opacity-80 leading-relaxed">{signal.reason}</p>
                </div>
              )}
              {!signal && !(selectedSymbol in enrichedData) && (
                <div className="px-5 py-2.5 text-xs text-gray-400 dark:text-gray-600 border-b border-gray-100 dark:border-gray-800 animate-pulse">
                  Loading signal…
                </div>
              )}

              {/* Transaction list */}
              <div className="overflow-y-auto scrollbar-hide flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-gray-900">
                    <tr className="text-xs text-gray-400 dark:text-gray-600 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800">
                      <th className="text-left px-5 py-2.5 font-medium">Date</th>
                      <th className="text-left px-4 py-2.5 font-medium">Type</th>
                      <th className="text-right px-4 py-2.5 font-medium">Shares</th>
                      <th className="text-right px-5 py-2.5 font-medium">Cash Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {symTx.map((tx) => (
                      <tr key={tx.id} className="border-t border-gray-100 dark:border-gray-800/40 hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors">
                        <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 tabular-nums whitespace-nowrap">
                          {new Date(tx.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            tx.type === 'buy'
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                          }`}>
                            {tx.type}
                          </span>
                        </td>
                        <td className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 tabular-nums">
                          {tx.shares < 1 ? tx.shares.toFixed(6) : tx.shares.toFixed(4)}
                        </td>
                        <td className={`text-right px-5 py-3 tabular-nums font-medium ${
                          tx.type === 'sell' ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                        }`}>
                          {tx.type === 'sell' ? '-' : ''}{usd(tx.cashInvested)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
