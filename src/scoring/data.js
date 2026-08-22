import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase'

const CHART_PROXY = `${SUPABASE_URL}/functions/v1/yahoo-chart`
const AUTH = { Authorization: `Bearer ${SUPABASE_ANON_KEY}` }

// ~2y of daily bars comfortably covers EMA200 warmup + slope lookback
// (indicators.py recommends >=220 bars, ideally ~290).
export async function fetchDailyCloses(symbol, range = '2y') {
  const url = `${CHART_PROXY}?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=1d`
  const res = await fetch(url, { headers: AUTH })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  const result = json.chart?.result?.[0]
  if (!result) throw new Error(json.chart?.error?.description ?? 'No data returned')
  return (result.indicators?.quote?.[0]?.close ?? []).filter((c) => c != null)
}

const MACRO_SYMBOLS = ['SPY', 'RSP', 'IWM', 'HYG', 'LQD', 'TLT', 'XLY', 'XLP']

export async function fetchMacroSeries() {
  const entries = await Promise.all(
    MACRO_SYMBOLS.map(async (sym) => {
      try {
        return [sym, await fetchDailyCloses(sym)]
      } catch {
        return [sym, null]
      }
    })
  )
  return Object.fromEntries(entries)
}
