const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const { searchParams } = new URL(req.url)
  const symbolsParam = searchParams.get('symbols') ?? ''
  const symbolList = symbolsParam.split(',').map((s) => s.trim()).filter(Boolean)

  if (!symbolList.length) {
    return new Response(JSON.stringify({ error: 'symbols is required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }

  const results = await Promise.all(
    symbolList.map(async (symbol) => {
      try {
        // 3mo daily gives us current meta AND enough volume history to compute avg
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d&includePrePost=false`,
          { headers: { 'User-Agent': 'Mozilla/5.0' } }
        )
        if (!res.ok) return null
        const json = await res.json()
        const result = json?.chart?.result?.[0]
        if (!result) return null

        const meta = result.meta
        const volumes: (number | null)[] = result.indicators?.quote?.[0]?.volume ?? []

        // Average daily volume from the 3-month window
        const validVols = volumes.filter((v) => v != null && v > 0) as number[]
        const averageDailyVolume3Month = validVols.length > 0
          ? Math.round(validVols.reduce((s, v) => s + v, 0) / validVols.length)
          : null

        const prev = meta.chartPreviousClose ?? meta.regularMarketPrice
        const change = meta.regularMarketPrice - prev
        const changePct = prev > 0 ? (change / prev) * 100 : 0

        return {
          symbol:                     meta.symbol ?? symbol,
          regularMarketPrice:         meta.regularMarketPrice,
          regularMarketChange:        change,
          regularMarketChangePercent: meta.regularMarketChangePercent ?? changePct,
          regularMarketVolume:        meta.regularMarketVolume ?? null,
          regularMarketDayHigh:       meta.regularMarketDayHigh ?? null,
          regularMarketDayLow:        meta.regularMarketDayLow ?? null,
          regularMarketTime:          meta.regularMarketTime ?? null,
          averageDailyVolume3Month,
          fiftyTwoWeekHigh:           meta.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow:            meta.fiftyTwoWeekLow ?? null,
          marketCap:                  null,
          beta:                       null,
          floatShares:                null,
        }
      } catch {
        return null
      }
    })
  )

  return new Response(JSON.stringify({ quotes: results.filter(Boolean) }), {
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
})
