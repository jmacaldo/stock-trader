// Session-level cache for ticker scores. Scores are derived from daily-close
// indicators, so they don't need the 30s/5min refresh cadence used for live
// quotes — a coarse TTL avoids re-fetching ~2y of history on every render.
import { fetchDailyCloses, fetchMacroSeries } from './data'
import { scoreMacro } from './macroPillar'
import { scoreSymbol } from './score'

const TICKER_TTL = 60 * 60 * 1000 // 1h
const MACRO_TTL = 4 * 60 * 60 * 1000 // 4h — shared regime score

// Closes are cached per symbol (the expensive part — a ~2y history fetch);
// the decision cascade is cheap to recompute per call, which matters because
// the same symbol is legitimately scored under different `holding` values
// (flat in Watchlist/MarketMovers, held in Portfolio) and those produce
// different decisions from the same indicators.
const closesCache = new Map() // symbol -> { at, promise }
let macroCache = null // { at, promise }

function getCloses(symbol) {
  const now = Date.now()
  const cached = closesCache.get(symbol)
  if (cached && now - cached.at < TICKER_TTL) return cached.promise

  const promise = fetchDailyCloses(symbol).catch(() => null)
  closesCache.set(symbol, { at: now, promise })
  return promise
}

function getMacroScore() {
  const now = Date.now()
  if (!macroCache || now - macroCache.at > MACRO_TTL) {
    macroCache = {
      at: now,
      promise: fetchMacroSeries()
        .then((series) => scoreMacro({ series }))
        .catch(() => null),
    }
  }
  return macroCache.promise
}

// Returns a full scoreSymbol() card for `symbol`, or null if there isn't
// enough price history to score it. `holding`: true | false | null.
export async function getTickerScore(symbol, { holding = null } = {}) {
  const [closes, macro] = await Promise.all([getCloses(symbol), getMacroScore()])
  if (!closes || closes.length < 30) return null
  try {
    return scoreSymbol(closes, { symbol, macroScore: macro?.pillarScore ?? null, holding })
  } catch {
    return null
  }
}
