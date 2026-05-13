import { supabase } from './supabase'
import { fetchQuotes } from './api'

const STALE_MS = 60_000

const WATCHLIST = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','JPM','V','UNH',
  'XOM','JNJ','WMT','MA','PG','LLY','HD','CVX','MRK','ABBV',
  'AVGO','COST','KO','ADBE','CSCO','BAC','CRM','NFLX','AMD','DIS',
]

export async function refreshMovers(count = 8) {
  const { data: rows } = await supabase
    .from('market_movers_cache')
    .select('id, data, updated_at')
    .in('id', ['gainers', 'losers'])

  const stored = Object.fromEntries((rows ?? []).map((r) => [r.id, r]))
  const gainersRow = stored['gainers']
  const isStale = !gainersRow ||
    Date.now() - new Date(gainersRow.updated_at).getTime() > STALE_MS

  if (!isStale) {
    return {
      gainers: stored['gainers']?.data ?? [],
      losers:  stored['losers']?.data  ?? [],
    }
  }

  const quotes = await fetchQuotes(WATCHLIST)
  const valid  = quotes.filter((q) => q.regularMarketChangePercent != null)
  const sorted = [...valid].sort((a, b) => b.regularMarketChangePercent - a.regularMarketChangePercent)
  const gainers = sorted.slice(0, count)
  const losers  = sorted.slice(-count).reverse()

  const ts = new Date().toISOString()
  await supabase.from('market_movers_cache').upsert(
    [
      { id: 'gainers', data: gainers, updated_at: ts },
      { id: 'losers',  data: losers,  updated_at: ts },
    ],
    { onConflict: 'id' }
  )

  return { gainers, losers }
}
