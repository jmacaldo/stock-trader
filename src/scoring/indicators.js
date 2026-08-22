// Deterministic indicator engine (ported from agentic-trading-desk's indicators.py):
// EMA 20/50/200 · RSI-14 (Wilder) · MACD 12/26/9 · TRIX-15 (signal 9) · Bollinger 20/2
// Input: array of daily close prices, oldest -> newest.

function strip(values) {
  return values.filter((v) => v != null)
}

export function emaSeries(values, period) {
  const n = values.length
  const out = new Array(n).fill(null)
  if (n < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  seed /= period
  out[period - 1] = seed
  let prev = seed
  for (let i = period; i < n; i++) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

export function rsiWilder(close, period = 14) {
  const n = close.length
  const out = new Array(n).fill(null)
  if (n < period + 1) return out
  const gains = []
  const losses = []
  for (let i = 1; i < n; i++) {
    const ch = close[i] - close[i - 1]
    gains.push(Math.max(ch, 0))
    losses.push(Math.max(-ch, 0))
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period
  const rsiVal = (ag, al) => (al === 0 ? 100 : 100 - 100 / (1 + ag / al))
  out[period] = rsiVal(avgGain, avgLoss)
  for (let i = period + 1; i < n; i++) {
    const g = gains[i - 1]
    const l = losses[i - 1]
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    out[i] = rsiVal(avgGain, avgLoss)
  }
  return out
}

export function macd(close, fast = 12, slow = 26, signal = 9) {
  const ef = emaSeries(close, fast)
  const es = emaSeries(close, slow)
  const line = ef.map((a, i) => (a != null && es[i] != null ? a - es[i] : null))
  const valid = strip(line)
  const sigValid = emaSeries(valid, signal)
  const sig = new Array(close.length).fill(null)
  const first = line.findIndex((v) => v != null)
  if (first !== -1) {
    sigValid.forEach((v, off) => { sig[first + off] = v })
  }
  const hist = line.map((m, i) => (m != null && sig[i] != null ? m - sig[i] : null))
  return { line, signal: sig, hist }
}

export function trix(close, period = 15, signal = 9) {
  const n = close.length
  const e1 = strip(emaSeries(close, period))
  const e2 = strip(emaSeries(e1, period))
  const e3 = strip(emaSeries(e2, period))
  const trixValid = []
  for (let i = 1; i < e3.length; i++) {
    const prev = e3[i - 1]
    trixValid.push(prev !== 0 ? ((e3[i] - prev) / prev) * 100 : 0)
  }
  const sigValid = strip(emaSeries(trixValid, signal))
  const t = new Array(n).fill(null)
  trixValid.forEach((v, off) => {
    const idx = n - trixValid.length + off
    if (idx >= 0) t[idx] = v
  })
  const s = new Array(n).fill(null)
  sigValid.forEach((v, off) => {
    const idx = n - sigValid.length + off
    if (idx >= 0) s[idx] = v
  })
  return { trix: t, signal: s }
}

function pstdev(values) {
  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return Math.sqrt(variance)
}

export function bollinger(close, period = 20, mult = 2.0) {
  if (close.length < period) return { mid: null, upper: null, lower: null, percentB: null }
  const window = close.slice(-period)
  const mid = window.reduce((a, b) => a + b, 0) / period
  const sd = pstdev(window)
  const upper = mid + mult * sd
  const lower = mid - mult * sd
  const rng = upper - lower
  const percentB = rng !== 0 ? (close[close.length - 1] - lower) / rng : 0.5
  return { mid, upper, lower, percentB }
}

function slope(series, lookback) {
  const validIdx = []
  series.forEach((v, i) => { if (v != null) validIdx.push(i) })
  if (validIdx.length <= lookback) return null
  const lastI = validIdx[validIdx.length - 1]
  const prevI = validIdx[validIdx.length - 1 - lookback]
  return series[lastI] - series[prevI]
}

function last(series) {
  const v = strip(series)
  return v.length ? v[v.length - 1] : null
}

function prevValid(series) {
  const v = strip(series)
  return v.length >= 2 ? v[v.length - 2] : null
}

// Computes the entire indicator stack and returns the latest values + recent slopes.
// `slopeLookback`: bars to measure the slope (default 5 ~ one week).
export function compute(close, slopeLookback = 5) {
  const warning = close.length < 210
    ? `Only ${close.length} bars; EMA200/some indicators may be None. Ideal >=220.`
    : null

  const ema20 = emaSeries(close, 20)
  const ema50 = emaSeries(close, 50)
  const ema200 = emaSeries(close, 200)
  const rsi = rsiWilder(close, 14)
  const { line: macdLine, signal: macdSig, hist: macdHist } = macd(close, 12, 26, 9)
  const { trix: trixLine, signal: trixSig } = trix(close, 15, 9)
  const { mid: bbMid, upper: bbUpper, lower: bbLower, percentB } = bollinger(close, 20, 2.0)

  let barsSinceBelowEma20 = null
  for (let back = 0; back < close.length; back++) {
    const i = close.length - 1 - back
    if (ema20[i] != null && close[i] < ema20[i]) {
      barsSinceBelowEma20 = back
      break
    }
  }

  return {
    n_bars: close.length,
    warning,
    close: close[close.length - 1],
    ema20: last(ema20), ema50: last(ema50), ema200: last(ema200),
    ema20_slope: slope(ema20, slopeLookback),
    ema50_slope: slope(ema50, slopeLookback),
    ema200_slope: slope(ema200, slopeLookback),
    rsi14: last(rsi), rsi14_prev: prevValid(rsi),
    macd_line: last(macdLine), macd_signal: last(macdSig),
    macd_hist: last(macdHist), macd_hist_prev: prevValid(macdHist),
    trix: last(trixLine), trix_prev: prevValid(trixLine),
    trix_signal: last(trixSig), trix_signal_prev: prevValid(trixSig),
    bars_since_below_ema20: barsSinceBelowEma20,
    bb_mid: bbMid, bb_upper: bbUpper, bb_lower: bbLower, percent_b: percentB,
  }
}
