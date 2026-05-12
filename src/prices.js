import { supabase } from './supabase'

const STALE_MS = 15 * 60 * 1000

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
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${stale.join(',')}`
      )
      if (res.ok) {
        const json = await res.json()
        const quotes = json.quoteResponse?.result ?? []
        const updates = quotes
          .filter((q) => q.regularMarketPrice != null)
          .map((q) => ({
            symbol: q.symbol,
            price: q.regularMarketPrice,
            fetched_at: new Date().toISOString(),
          }))
        if (updates.length) {
          await supabase.from('stock_prices').upsert(updates, { onConflict: 'symbol' })
          updates.forEach((u) => { stored[u.symbol] = u })
        }
      }
    } catch {
      // fall through — use whatever is stored
    }
  }

  return Object.fromEntries(symbols.map((sym) => [sym, stored[sym]?.price ?? null]))
}
