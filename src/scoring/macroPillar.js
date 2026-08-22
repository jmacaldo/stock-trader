// Macro-Sentiment pillar (ported from agentic-trading-desk's macro_pillar.py).
// Cross-asset regime detector, shared once per session across all symbols.
//
// Sign orientation: +1 = risk-on / broadening, -1 = risk-off / concentration
// or contraction. All components are aligned to this convention before
// weighting. Yield-curve (10Y-2Y) has no reliable free daily source here, so
// its 20% weight is dynamically redistributed among the other components —
// pass `yieldSpread` (array of daily spread values, or a single scalar) if
// you later wire one up.

function sma(series, window) {
  if (series.length < window) return null
  const w = series.slice(-window)
  return w.reduce((a, b) => a + b, 0) / window
}

function ratioSeries(num, den) {
  const n = Math.min(num.length, den.length)
  const a = num.slice(-n), b = den.slice(-n)
  const out = []
  for (let i = 0; i < n; i++) if (b[i] !== 0) out.push(a[i] / b[i])
  return out
}

function pctReturns(series) {
  const out = []
  for (let i = 1; i < series.length; i++) {
    if (series[i - 1] !== 0) out.push(series[i] / series[i - 1] - 1.0)
  }
  return out
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length)
  if (n < 5) return null
  const x = xs.slice(-n), y = ys.slice(-n)
  const mx = x.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let cov = 0, vx = 0, vy = 0
  for (let i = 0; i < n; i++) {
    cov += (x[i] - mx) * (y[i] - my)
    vx += (x[i] - mx) ** 2
    vy += (y[i] - my) ** 2
  }
  if (vx === 0 || vy === 0) return null
  return cov / (Math.sqrt(vx) * Math.sqrt(vy))
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Directional signal -1/0/+1: base = position of last value vs its slow SMA,
// trend = slope of the slow SMA over `slopeWin`. signal = 0.5*base + 0.5*trend.
function trendSignal(series, fast, slow, slopeWin) {
  const sSlow = sma(series, slow)
  if (sSlow == null || series.length < slow + slopeWin) return { signal: null, detail: 'insufficient data' }
  const base = series[series.length - 1] > sSlow ? 1.0 : -1.0
  const slowThen = sma(series.slice(0, series.length - slopeWin), slow)
  if (slowThen == null) return { signal: null, detail: 'insufficient data for slope' }
  const trend = sSlow > slowThen ? 1.0 : -1.0
  const signal = 0.5 * base + 0.5 * trend
  const pos = base > 0 ? 'above' : 'below'
  const slp = trend > 0 ? 'rising' : 'falling'
  return { signal, detail: `ratio ${pos} SMA${slow}, SMA${slow} ${slp}` }
}

const BASE_WEIGHTS = {
  concentration: { ratio: 'RSP/SPY', weight: 0.25 },
  yield_curve:   { ratio: '10Y-2Y',  weight: 0.20 },
  credit:        { ratio: 'HYG/LQD', weight: 0.15 },
  size:          { ratio: 'IWM/SPY', weight: 0.15 },
  equity_bond:   { ratio: 'SPY/TLT', weight: 0.15 },
  sector:        { ratio: 'XLY/XLP', weight: 0.10 },
}

function component(key, name) {
  return { name, ratio: BASE_WEIGHTS[key].ratio, weight: BASE_WEIGHTS[key].weight, signal: null, detail: '', available: true }
}

// data: { series: { SPY, RSP, IWM, HYG, LQD, TLT, XLY, XLP: number[] }, yieldSpread?: number|number[], asOf? }
export function scoreMacro(data, { fast = 50, slow = 200, slopeWin = 20, corrWin = 40 } = {}) {
  const series = data.series ?? {}
  const notes = []
  const closes = (sym) => series[sym] ?? null

  const comps = {}

  // 1. Concentration: RSP/SPY (up = broadening = +)
  const rsp = closes('RSP'), spy = closes('SPY')
  let c = component('concentration', 'Concentration (equal vs cap-weight)')
  if (rsp && spy) { const r = trendSignal(ratioSeries(rsp, spy), fast, slow, slopeWin); c.signal = r.signal; c.detail = r.detail }
  if (c.signal == null) c.available = false
  comps.concentration = c

  // 2. Yield Curve 10Y-2Y (steepening = +); redistributed if unavailable
  c = component('yield_curve', 'Yield Curve 10Y-2Y')
  let spread = data.yieldSpread
  if (spread != null && !Array.isArray(spread)) spread = [spread]
  if (spread && spread.length >= slopeWin + 1) {
    const now = spread[spread.length - 1], then = spread[spread.length - 1 - slopeWin]
    const base = now > 0 ? 1.0 : -1.0
    const trend = now > then ? 1.0 : -1.0
    c.signal = 0.5 * base + 0.5 * trend
    c.detail = `spread ${now >= 0 ? '+' : ''}${now.toFixed(2)}, ${trend > 0 ? 'steepening' : 'flattening'}`
  } else if (spread) {
    const now = spread[spread.length - 1]
    c.signal = now > 0 ? 0.5 : -0.5
    c.detail = `spread ${now >= 0 ? '+' : ''}${now.toFixed(2)} (level only; no series for slope)`
    notes.push('yieldSpread with <21 observations: using level only (±0.5), no slope.')
  } else {
    c.available = false
    notes.push('No yieldSpread: redistributing the 20% weight of the curve among other components.')
  }
  comps.yield_curve = c

  // 3. Credit: HYG/LQD (up = risk-on = +)
  const hyg = closes('HYG'), lqd = closes('LQD')
  c = component('credit', 'Credit (high-yield vs IG)')
  if (hyg && lqd) { const r = trendSignal(ratioSeries(hyg, lqd), fast, slow, slopeWin); c.signal = r.signal; c.detail = r.detail }
  if (c.signal == null) c.available = false
  comps.credit = c

  // 4. Size: IWM/SPY (up = small-cap leadership = +)
  const iwm = closes('IWM')
  c = component('size', 'Size factor (small vs large)')
  if (iwm && spy) { const r = trendSignal(ratioSeries(iwm, spy), fast, slow, slopeWin); c.signal = r.signal; c.detail = r.detail }
  if (c.signal == null) c.available = false
  comps.size = c

  // 5. Equity-Bond: SPY/TLT (up = equities outperforming bonds = +)
  const tlt = closes('TLT')
  c = component('equity_bond', 'Equity vs Bond (SPY/TLT)')
  if (spy && tlt) { const r = trendSignal(ratioSeries(spy, tlt), fast, slow, slopeWin); c.signal = r.signal; c.detail = r.detail }
  if (c.signal == null) c.available = false
  comps.equity_bond = c

  // 6. Sector Rotation: XLY/XLP (up = cyclicals outperforming defensives = +)
  const xly = closes('XLY'), xlp = closes('XLP')
  c = component('sector', 'Sector rotation (cyclical vs defensive)')
  if (xly && xlp) { const r = trendSignal(ratioSeries(xly, xlp), fast, slow, slopeWin); c.signal = r.signal; c.detail = r.detail }
  if (c.signal == null) c.available = false
  comps.sector = c

  // SPY-TLT correlation for inflationary flag
  let spyTltCorr = null
  if (spy && tlt) {
    const rs = pctReturns(spy.slice(-(corrWin + 1)))
    const rt = pctReturns(tlt.slice(-(corrWin + 1)))
    spyTltCorr = pearson(rs, rt)
  }

  // Weighted composite (renormalizes for available weights)
  const avail = Object.values(comps).filter((c) => c.available && c.signal != null)
  if (!avail.length) return null
  const wsum = avail.reduce((s, c) => s + c.weight, 0)
  let composite = avail.reduce((s, c) => s + c.signal * c.weight, 0) / wsum
  composite = clamp(composite, -1.0, 1.0)

  // Inflationary flag: positive SPY-TLT correlation + weak equity-bond
  const eb = comps.equity_bond
  const inflationary = Boolean(
    spyTltCorr != null && spyTltCorr > 0.25 && eb.available && eb.signal != null && eb.signal <= 0
  )

  // Regime classification
  const rspSig = comps.concentration.signal ?? 0
  const iwmSig = comps.size.signal ?? 0
  const crSig = comps.credit.signal ?? 0
  let regime
  if (inflationary) regime = 'Inflationary'
  else if (composite <= -0.5 && crSig < 0) regime = 'Contraction'
  else if (composite >= 0.4 && iwmSig > 0) regime = 'Broadening'
  else if (rspSig < 0 && iwmSig < 0 && composite > -0.5) regime = 'Concentration'
  else regime = 'Transitional'

  // Mapping to the Macro-Sentiment pillar (-2..+2)
  let pillar, pillarLabel
  if (composite >= 0.5) { pillar = 2; pillarLabel = 'Strongly favorable macro' }
  else if (composite >= 0.2) { pillar = 1; pillarLabel = 'Favorable macro' }
  else if (composite > -0.2) { pillar = 0; pillarLabel = 'Neutral macro' }
  else if (composite > -0.5) { pillar = -1; pillarLabel = 'Adverse macro' }
  else { pillar = -2; pillarLabel = 'Strongly adverse macro' }

  // Risk-off regimes cap the pillar even if the composite is not extreme
  if ((regime === 'Contraction' || regime === 'Inflationary') && pillar > -1) {
    pillar = -1
    pillarLabel = `Adverse macro (cap due to ${regime} regime)`
    notes.push(`Pillar capped at -1 due to ${regime} regime.`)
  }

  return {
    asOf: data.asOf ?? '',
    composite: Math.round(composite * 1000) / 1000,
    regime,
    pillarScore: pillar,
    pillarLabel,
    inflationaryFlag: inflationary,
    spyTltCorr: spyTltCorr != null ? Math.round(spyTltCorr * 1000) / 1000 : null,
    components: Object.values(comps).map((c) => ({ ...c, signal: c.signal != null ? Math.round(c.signal * 100) / 100 : null })),
    notes,
  }
}
