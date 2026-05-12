import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STALE_MS = 15 * 60 * 1000
const BASE = 'https://finnhub.io/api/v1'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const apiKey = Deno.env.get('FINNHUB_API_KEY')
  if (!apiKey) return json({ error: 'FINNHUB_API_KEY not set' }, 500)

  // All distinct symbols across every user's portfolio
  const { data: positions, error: posErr } = await supabase
    .from('portfolio')
    .select('symbol')

  if (posErr) return json({ error: posErr.message }, 500)
  if (!positions?.length) return json({ message: 'No positions to update' })

  const symbols = [...new Set(positions.map((p: { symbol: string }) => p.symbol))]

  // Check which are stale
  const { data: stored } = await supabase
    .from('stock_prices')
    .select('symbol, fetched_at')
    .in('symbol', symbols)

  const storedMap = Object.fromEntries(
    (stored ?? []).map((r: { symbol: string; fetched_at: string }) => [r.symbol, r.fetched_at])
  )

  const now = Date.now()
  const stale = symbols.filter((sym) => {
    const t = storedMap[sym]
    return !t || now - new Date(t).getTime() > STALE_MS
  })

  if (!stale.length) return json({ message: 'All prices are fresh' })

  // Fetch from Finnhub (one call per symbol, in parallel)
  const results = await Promise.all(
    stale.map(async (sym) => {
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

  const updates = results.filter(Boolean) as { symbol: string; price: number; fetched_at: string }[]

  if (updates.length) {
    const { error: upsertErr } = await supabase
      .from('stock_prices')
      .upsert(updates, { onConflict: 'symbol' })
    if (upsertErr) return json({ error: upsertErr.message }, 500)
  }

  return json({ updated: updates.length, symbols: updates.map((u) => u.symbol) })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
