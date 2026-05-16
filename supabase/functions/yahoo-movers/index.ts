const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const { searchParams } = new URL(req.url)
  const count = searchParams.get('count') ?? '10'

  const [gainersRes, losersRes] = await Promise.all([
    fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_gainers&count=${count}&formatted=false`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    ),
    fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=day_losers&count=${count}&formatted=false`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    ),
  ])

  const [gainersJson, losersJson] = await Promise.all([
    gainersRes.json(),
    losersRes.json(),
  ])

  const pluck = (json: any) =>
    (json?.finance?.result?.[0]?.quotes ?? []).map((q: any) => ({
      symbol:                     q.symbol,
      shortName:                  q.shortName ?? q.longName ?? q.symbol,
      regularMarketPrice:         q.regularMarketPrice,
      regularMarketChange:        q.regularMarketChange,
      regularMarketChangePercent: q.regularMarketChangePercent,
      regularMarketTime:          q.regularMarketTime,
      regularMarketVolume:        q.regularMarketVolume,
      regularMarketDayHigh:       q.regularMarketDayHigh,
      regularMarketDayLow:        q.regularMarketDayLow,
      averageDailyVolume3Month:   q.averageDailyVolume3Month,
      fiftyTwoWeekHigh:           q.fiftyTwoWeekHigh,
      fiftyTwoWeekLow:            q.fiftyTwoWeekLow,
      marketCap:                  q.marketCap,
      beta:                       q.beta,
      floatShares:                q.floatShares,
    }))

  return new Response(
    JSON.stringify({ gainers: pluck(gainersJson), losers: pluck(losersJson) }),
    { headers: { 'Content-Type': 'application/json', ...CORS } }
  )
})
