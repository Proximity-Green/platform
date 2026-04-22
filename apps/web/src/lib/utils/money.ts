/**
 * Universal money formatter used across the app.
 *
 *   1200000     → "1,200,000"
 *   1200000.00  → "1,200,000"
 *   4240.50     → "4,240.50"
 *   null        → "—"
 */
export function fmtMoney(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  const hasCents = Math.round(n * 100) % 100 !== 0
  return n.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2
  })
}

/**
 * Same as `fmtMoney` but prefixed with a currency code (e.g. "ZAR 4,240").
 * Falls back to just the number when no currency is given.
 */
export function fmtMoneyWithCurrency(
  value: number | string | null | undefined,
  currency: string | null | undefined
): string {
  const body = fmtMoney(value)
  if (body === '—') return '—'
  return currency ? `${currency} ${body}` : body
}
