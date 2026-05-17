import { useState, useEffect } from 'react'

export function formatAge(date) {
  if (!date) return null
  const secs = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const m = Math.floor(secs / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60), rm = m % 60
  if (h < 24) return rm > 0 ? `${h}h ${rm}m ago` : `${h}h ago`
  const d = Math.floor(h / 24), rh = h % 24
  return rh > 0 ? `${d}d ${rh}h ago` : `${d}d ago`
}

export function useNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}
