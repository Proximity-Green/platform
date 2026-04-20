export type CsvColumn<T> = {
  key: string
  label: string
  get?: (row: T) => unknown
}

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  const header = columns.map(c => csvEscape(c.label)).join(',')
  const body = rows
    .map(r => columns.map(c => csvEscape(c.get ? c.get(r) : (r as any)[c.key])).join(','))
    .join('\n')
  const csv = header + '\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
