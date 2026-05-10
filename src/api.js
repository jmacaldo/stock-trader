import { useStore } from './store'
import { STOCKS } from './stocks'

const BASE = 'https://finnhub.io/api/v1'

function key() {
  return useStore.getState().apiKey
}

function localName(symbol) {
  return STOCKS.find((s) => s.symbol === symbol.toUpperCase())?.name ?? null
}

export async function fetchQuote(symbol) {
  const sym = symbol.toUpperCase()
  const [quoteRes, profileRes] = await Promise.all([
    fetch(`${BASE}/quote?symbol=${sym}&token=${key()}`),
    fetch(`${BASE}/stock/profile2?symbol=${sym}&token=${key()}`),
  ])

  if (!quoteRes.ok) throw new Error(`HTTP ${quoteRes.status}`)
  const q = await quoteRes.json()

  // c === 0 means symbol not found or market data unavailable
  if (!q.c) throw new Error('Symbol not found')

  const profile = profileRes.ok ? await profileRes.json() : {}

  return {
    symbol: sym,
    shortName: localName(sym) ?? profile.name ?? sym,
    currency: profile.currency ?? 'USD',
    regularMarketPrice: q.c,
    regularMarketChange: q.d ?? 0,
    regularMarketChangePercent: q.dp ?? 0,
    regularMarketPreviousClose: q.pc ?? q.c,
    regularMarketOpen: q.o ?? q.c,
    regularMarketDayHigh: q.h ?? q.c,
    regularMarketDayLow: q.l ?? q.c,
    regularMarketVolume: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    marketCap: profile.marketCapitalization ? profile.marketCapitalization * 1e6 : null,
  }
}

export async function fetchQuotes(symbols) {
  if (!symbols.length) return []
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${key()}`)
        if (!res.ok) return null
        const q = await res.json()
        if (!q.c) return null
        return { symbol: sym, regularMarketPrice: q.c, regularMarketChange: q.d ?? 0, regularMarketChangePercent: q.dp ?? 0 }
      } catch {
        return null
      }
    })
  )
  return results.filter(Boolean)
}

export async function validateApiKey(apiKey) {
  const res = await fetch(`${BASE}/quote?symbol=AAPL&token=${apiKey}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const q = await res.json()
  if (!q.c) throw new Error('Invalid key')
}
