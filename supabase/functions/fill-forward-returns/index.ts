import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Cron-invoked (see supabase/signal_log.sql). Fills in ret3/5/10/20 for
// signal_log rows once enough trading days have actually passed — trading-day
// aligned by looking up real bars in fetched chart data, not calendar-day math.
const HORIZONS: Record<string, number> = { ret3: 3, ret5: 5, ret10: 10, ret20: 20 }

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: pending, error } = await supabase
    .from('signal_log')
    .select('id, symbol, signal_date, ret3, ret5, ret10, ret20')
    .is('ret20', null)
    .limit(500)

  if (error) return json({ error: error.message }, 500)
  if (!pending?.length) return json({ message: 'Nothing pending' })

  const bySymbol = new Map<string, typeof pending>()
  for (const row of pending) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, [])
    bySymbol.get(row.symbol)!.push(row)
  }

  let rowsUpdated = 0
  for (const [symbol, rows] of bySymbol) {
    try {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      )
      const body = await res.json()
      const result = body.chart?.result?.[0]
      if (!result) continue
      const timestamps: number[] = result.timestamp ?? []
      const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []
      const dates = timestamps.map((t) => new Date(t * 1000).toISOString().split('T')[0])

      for (const row of rows) {
        // First trading bar on or after the (calendar-date) signal_date.
        const idx = dates.findIndex((d) => d >= row.signal_date)
        if (idx === -1 || closes[idx] == null) continue
        const startPrice = closes[idx] as number

        const patch: Record<string, number> = {}
        for (const [field, offset] of Object.entries(HORIZONS)) {
          if (row[field as keyof typeof row] != null) continue // already filled
          const p = closes[idx + offset]
          if (p != null) patch[field] = p / startPrice - 1
        }
        if (Object.keys(patch).length) {
          const { error: updErr } = await supabase.from('signal_log').update(patch).eq('id', row.id)
          if (!updErr) rowsUpdated++
        }
      }
    } catch {
      // best-effort per symbol — a bad fetch for one shouldn't block the rest
    }
  }

  return json({ pending: pending.length, symbolsProcessed: bySymbol.size, rowsUpdated })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
