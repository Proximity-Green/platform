// Pricing engine.
//
// One model: read pricing_params on item_types, evaluate against the item's
// detail row, fall back to items.base_rate when no expression is set.
//
// Detail-table mapping is by convention: items.item_type.slug → <slug>_details.
// e.g. office → office_details, meeting_room → meeting_room_details.

export type PricingParams = {
  /**
   * Algebraic expression referencing field names from the detail table.
   * Example: "area_sqm * (1 + aesthetic_impact) * (1 + safety_margin) * start_price_per_m2"
   */
  expression?: string
  /**
   * Round-up to nearest multiple. e.g. 10 → ceil(value / 10) * 10.
   */
  round_to?: number
  /**
   * Friendly name for this pricing model (optional). Defaults to item_type.name.
   */
  name?: string
  /**
   * Anything else admins want to stash.
   */
  [key: string]: unknown
}

// ────────────────────────────────────────────────────────────────────────
// Safe arithmetic expression evaluator
// Supports: + - * /, parens, identifiers (resolved from inputs), numbers,
// unary minus. No function calls, no eval, no globals.
// ────────────────────────────────────────────────────────────────────────

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'id'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    const c = input[i]
    if (/\s/.test(c)) { i++; continue }
    if ('+-*/()'.includes(c)) {
      tokens.push({ kind: 'op', op: c as '+' | '-' | '*' | '/' | '(' | ')' })
      i++; continue
    }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < input.length && /[0-9.]/.test(input[j])) j++
      tokens.push({ kind: 'num', value: Number(input.slice(i, j)) })
      i = j; continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < input.length && /[a-zA-Z_0-9]/.test(input[j])) j++
      tokens.push({ kind: 'id', name: input.slice(i, j) })
      i = j; continue
    }
    if (c === '"' || c === "'") {
      // tolerate quoted identifiers like "area_sqm" — strip quotes
      const quote = c
      let j = i + 1
      while (j < input.length && input[j] !== quote) j++
      const ident = input.slice(i + 1, j)
      if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(ident)) {
        throw new Error(`Invalid quoted identifier: "${ident}"`)
      }
      tokens.push({ kind: 'id', name: ident })
      i = j + 1; continue
    }
    throw new Error(`Unexpected character: ${c}`)
  }
  return tokens
}

function evalTokens(tokens: Token[], inputs: Record<string, number>): number {
  let pos = 0

  function expect(op: string): void {
    const t = tokens[pos]
    if (!t || t.kind !== 'op' || t.op !== op) {
      throw new Error(`Expected '${op}'`)
    }
    pos++
  }

  function parseExpr(): number {
    let left = parseTerm()
    while (pos < tokens.length) {
      const t = tokens[pos]
      if (t.kind === 'op' && (t.op === '+' || t.op === '-')) {
        pos++
        const right = parseTerm()
        left = t.op === '+' ? left + right : left - right
      } else break
    }
    return left
  }

  function parseTerm(): number {
    let left = parseFactor()
    while (pos < tokens.length) {
      const t = tokens[pos]
      if (t.kind === 'op' && (t.op === '*' || t.op === '/')) {
        pos++
        const right = parseFactor()
        left = t.op === '*' ? left * right : left / right
      } else break
    }
    return left
  }

  function parseFactor(): number {
    const t = tokens[pos]
    if (!t) throw new Error('Unexpected end of expression')
    if (t.kind === 'num') { pos++; return t.value }
    if (t.kind === 'id') {
      pos++
      const raw = inputs[t.name]
      if (raw == null || Number.isNaN(Number(raw))) {
        throw new Error(`Missing input: ${t.name}`)
      }
      return Number(raw)
    }
    if (t.kind === 'op' && t.op === '(') {
      pos++
      const v = parseExpr()
      expect(')')
      return v
    }
    if (t.kind === 'op' && t.op === '-') {
      pos++
      return -parseFactor()
    }
    if (t.kind === 'op' && t.op === '+') {
      pos++
      return parseFactor()
    }
    throw new Error(`Unexpected token`)
  }

  const result = parseExpr()
  if (pos < tokens.length) throw new Error('Unparsed trailing tokens')
  return result
}

export type EvalResult =
  | { ok: true; value: number }
  | { ok: false; error: string; missing?: string[] }

export function evaluateExpression(
  expression: string | undefined | null,
  inputs: Record<string, number | null | undefined>
): EvalResult {
  if (!expression || !expression.trim()) {
    return { ok: false, error: 'No expression' }
  }
  // Pre-scan for missing inputs to give a friendlier error
  const referenced = Array.from(expression.matchAll(/[a-zA-Z_][a-zA-Z_0-9]*/g))
    .map(m => m[0])
    .filter((v, i, arr) => arr.indexOf(v) === i)
  const missing = referenced.filter(name => {
    const v = inputs[name]
    return v == null || Number.isNaN(Number(v))
  })
  if (missing.length > 0) {
    return { ok: false, error: `Missing inputs: ${missing.join(', ')}`, missing }
  }
  try {
    const tokens = tokenize(expression)
    const numericInputs: Record<string, number> = {}
    for (const k of Object.keys(inputs)) {
      const v = inputs[k]
      if (v != null) numericInputs[k] = Number(v)
    }
    const value = evalTokens(tokens, numericInputs)
    return { ok: true, value }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'eval failed' }
  }
}

export function applyRounding(value: number, roundTo: number | undefined): number {
  if (!roundTo || roundTo <= 0) return value
  return Math.ceil(value / roundTo) * roundTo
}

// Clamp to currency precision so IEEE-754 drift like 137.50000000000003
// doesn't leak into the form / database.
function toCents(value: number): number {
  return Math.round(value * 100) / 100
}

export type ResolvedPrice = {
  /** Final number to display / save as base_rate. */
  amount: number
  /** Where the number came from. */
  source: 'expression' | 'base_rate'
  /** Pre-rounding figure if rounding was applied. */
  raw?: number
}

/**
 * High-level resolver. Pass the type's pricing_params, the item's detail-row
 * inputs, and the manual base_rate fallback. Returns the resolved price + source.
 */
export function resolvePrice(
  params: PricingParams | null | undefined,
  detailInputs: Record<string, number | null | undefined>,
  baseRate: number | null | undefined
): ResolvedPrice | { ok: false; error: string; missing?: string[] } {
  const expression = params?.expression
  if (expression && expression.trim()) {
    const evald = evaluateExpression(expression, detailInputs)
    if (!evald.ok) return { ok: false, error: evald.error, missing: (evald as any).missing }
    const raw = evald.value
    const rounded = applyRounding(raw, params?.round_to)
    const amount = toCents(rounded)
    // Only surface `raw` when an explicit round_to actually moved the value.
    // Without a round_to, rounded == raw and the only difference is FP-drift
    // cleanup, which is noise the UI shouldn't bother showing.
    const meaningful = !!params?.round_to && Math.abs(rounded - raw) > 0.005
    return {
      amount,
      source: 'expression',
      raw: meaningful ? toCents(raw) : undefined
    }
  }
  if (baseRate != null) {
    return { amount: toCents(Number(baseRate)), source: 'base_rate' }
  }
  return { ok: false, error: 'No price set' }
}
