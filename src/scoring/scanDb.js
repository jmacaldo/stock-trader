import { supabase } from '../supabase'

// Momentum Scanner results are shared/cached (see supabase/momentum_scan_results.sql)
// rather than user-scoped — the scan is objective, not tied to one account.

export async function loadScanResults() {
  const { data, error } = await supabase
    .from('momentum_scan_results')
    .select('*')
    .order('pillar_total', { ascending: false })
  if (error || !data?.length) return null
  return {
    scannedAt: new Date(data[0].scanned_at),
    hits: data.map((r) => ({
      symbol: r.symbol,
      name: r.name,
      action: r.action,
      pillarTotal: r.pillar_total,
      trendScore: r.trend_score,
      momentumScore: r.momentum_score,
      reboundFlag: r.rebound_flag,
    })),
  }
}

// Replaces the whole cache with this scan's hits (stale rows removed).
export async function saveScanResults(hits) {
  const scannedAt = new Date().toISOString()
  const rows = hits.map((h) => ({
    symbol: h.symbol,
    name: h.name,
    action: h.action,
    pillar_total: h.pillarTotal,
    trend_score: h.trendScore,
    momentum_score: h.momentumScore,
    rebound_flag: h.reboundFlag,
    scanned_at: scannedAt,
  }))
  await supabase.from('momentum_scan_results').delete().neq('symbol', '')
  if (rows.length) await supabase.from('momentum_scan_results').insert(rows)
}
