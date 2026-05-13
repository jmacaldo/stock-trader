import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STALE_MS = 60_000
const BASE = 'https://finnhub.io/api/v1'
const COUNT = 8

const WATCHLIST = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','JPM','V','UNH',
  'XOM','JNJ','WMT','MA','PG','LLY','HD','CVX','MRK','ABBV',
  'AVGO','COST','KO','ADBE','CSCO','BAC','CRM','NFLX','AMD','DIS',
]

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const apiKey = Deno.env.get('FINNHUB_API_KEY')
  if (!apiKey) return json({ error: 'FINNHUB_API_KEY not set' }, 500)

  // Check staleness
  const { data: rows } = await supabase
    .from('market_movers_cache')
    .select('id, updated_at')
    .in('id', ['gainers', 'losers'])

  const stored = Object.fromEntries((rows ?? []).map((r: { id: string; updated_at: string }) => [r.id, r]))
  const gainersRow = stored['gainers']
  const isStale = !gainersRow ||
    Date.now() - new Date(gainersRow.updated_at).getTime() > STALE_MS

  if (!isStale) return json({ message: 'Cache is fresh' })

  // Fetch all 30 symbols from Finnhub in parallel
  const results = await Promise.all(
    WATCHLIST.map(async (sym) => {
      try {
        const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${apiKey}`)
        if (!res.ok) return null
        const q = await res.json()
        if (q.c == null || q.c === 0) return null
        return {
          symbol: sym,
          regularMarketPrice: q.c,
          regularMarketChange: q.d ?? 0,
          regularMarketChangePercent: q.dp ?? 0,
        }
      } catch {
        return null
      }
    })
  )

  const valid = results.filter(Boolean) as {
    symbol: string
    regularMarketPrice: number
    regularMarketChange: number
    regularMarketChangePercent: number
  }[]

  const sorted = [...valid].sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
  const gainers = sorted.slice(0, COUNT)
  const losers = sorted.slice(-COUNT).reverse()

  const ts = new Date().toISOString()
  const { error: upsertErr } = await supabase
    .from('market_movers_cache')
    .upsert(
      [
        { id: 'gainers', data: gainers, updated_at: ts },
        { id: 'losers',  data: losers,  updated_at: ts },
      ],
      { onConflict: 'id' }
    )

  if (upsertErr) return json({ error: upsertErr.message }, 500)

  return json({ updated: true, gainers: gainers.length, losers: losers.length })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
