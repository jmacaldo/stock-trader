import { supabase } from './supabase'
import { useStore } from './store'

const STALE_MS = 15 * 60 * 1000
const BASE = 'https://finnhub.io/api/v1'

async function fetchFinnhubPrices(symbols, apiKey) {
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${apiKey}`)
        if (!res.ok) return null
        const q = await res.json()
        if (!q.c) return null
        return { symbol: sym, price: q.c, fetched_at: new Date().toISOString() }
      } catch {
        return null
      }
    })
  )
  return results.filter(Boolean)
}

export async function refreshPrices(symbols) {
  if (!symbols.length) return {}

  const { data: rows } = await supabase
    .from('stock_prices')
    .select('symbol, price, fetched_at')
    .in('symbol', symbols)

  const stored = Object.fromEntries((rows ?? []).map((r) => [r.symbol, r]))

  const now = Date.now()
  const stale = symbols.filter((sym) => {
    const r = stored[sym]
    return !r || now - new Date(r.fetched_at).getTime() > STALE_MS
  })

  if (stale.length) {
    const apiKey = useStore.getState().apiKey
    if (apiKey) {
      try {
        const updates = await fetchFinnhubPrices(stale, apiKey)
        if (updates.length) {
          await supabase.from('stock_prices').upsert(updates, { onConflict: 'symbol' })
          updates.forEach((u) => { stored[u.symbol] = u })
        }
      } catch {
        // fall through — use whatever is stored
      }
    }
  }

  return Object.fromEntries(symbols.map((sym) => [sym, stored[sym]?.price ?? null]))
}
