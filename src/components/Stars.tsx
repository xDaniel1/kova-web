export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, (rating / 5) * 100))
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${rating.toFixed(1)} stars`}>
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fg" style={{ width: `${pct}%` }}>★★★★★</span>
    </span>
  )
}

export const PRICE: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

/** "Open · Closes 10 PM" / "Closed · Opens 8 AM" from Google's weekday descriptions. */
export function openLine(openNow: boolean | undefined, weekday: string[] | undefined): { open: boolean | undefined; text: string } {
  if (openNow === undefined) return { open: undefined, text: '' }
  const today = (new Date().getDay() + 6) % 7
  const hours = weekday?.[today]?.replace(/^[^:]+:\s*/, '') ?? ''
  if (/24 hours/i.test(hours)) return { open: true, text: 'Open 24 hours' }
  const parts = hours.split(/[–-]/).map((s) => s.trim())
  if (openNow) return { open: true, text: parts[1] ? `Closes ${parts[parts.length - 1]}` : '' }
  const tomorrow = weekday?.[(today + 1) % 7]?.replace(/^[^:]+:\s*/, '')
  const opens = hours && !/closed/i.test(hours) ? parts[0] : tomorrow?.split(/[–-]/)[0]?.trim()
  return { open: false, text: opens && !/closed/i.test(opens) ? `Opens ${opens}` : '' }
}
