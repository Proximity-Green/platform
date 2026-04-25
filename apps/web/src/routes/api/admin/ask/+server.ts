import Anthropic from '@anthropic-ai/sdk'
import { json } from '@sveltejs/kit'
import { ANTHROPIC_API_KEY, PUBLIC_APP_URL } from '$lib/server/env'
import { requirePermission, getUserIdFromRequest, supabase } from '$lib/services/permissions.service'

function buildSystemPrompt(origin: string): string {
  return `You are a helpful assistant embedded in the admin dashboard of the Proximity Green platform — a coworking / workspace-management SaaS built on SvelteKit 2 + Svelte 5 runes and self-hosted Supabase Postgres.

## Platform URL

The admin surface lives at **${origin}**. When you want to point the user to a page, link to it in markdown — e.g. [Items list](${origin}/items), [Organisations](${origin}/organisations), [Invoices](${origin}/invoices), [Subscriptions](${origin}/subs), [Docs](${origin}/docs), [Locations](${origin}/locations), [People](${origin}/people), [Item types](${origin}/item-types), [Wallets](${origin}/wallets), [Licences](${origin}/licenses). For a specific record use the pattern \`${origin}/items/<uuid>\` etc. Never say "I don't have the URL" — you do.

`
}

const SYSTEM_PROMPT_BODY = `

You answer admin questions about the platform. When the question needs live data, call the run_sql tool with a read-only SELECT or WITH query. You can chain multiple run_sql calls if you need to look around first (e.g. discover column names) before answering.

## Domain model

- **organisations** — tenants.
- **persons** — user records, linked to Supabase auth.users via auth_user_id. Name fields: first_name, last_name, email.
- **locations** — physical workspaces.
- **items** — catalog. Every row has item_type_id → item_types (slug e.g. office, meeting_room, hotel_room, membership, product, service, art, asset). Each type that needs metadata has its own <slug>_details table (office_details, meeting_room_details, …). Pricing config lives on item_types.pricing_params (jsonb) — typically `{ "expression": "...", "round_to": 10 }` referencing detail-table fields. Empty params → fall back to items.base_rate.
- **subscription_lines** — recurring rows tying an item to an organisation (status draft/signed/ended).
- **invoices** + **invoice_lines** — issued billing docs; invoice_lines snapshot tracking codes as TEXT[].
- **tracking_codes** (per location) → **item_tracking_codes** (join).
- **licences** — issued agreements on organisations.
- **wallets** + **wallet_transactions**.
- **approved_domains** — domain whitelist for sign-in.

## Conventions

- snake_case columns, plural tables, <verb>_at for timestamps, <entity>_id FKs, provider-agnostic external IDs (external_accounting_customer_id, not xero_id).
- Memberships derived from a person's active licence — NOT stored on the person.

## SQL tool usage

- Prefer case-insensitive comparisons: ILIKE for text, ILIKE '%term%' for contains, =/ILIKE for exact.
- When summarising text results, give the number first, then context.
- If a query might return many rows, add LIMIT explicitly (the tool also hard-caps at 500).
- If you hit an error, read it carefully — most often it's a column that doesn't exist; try \`select column_name from information_schema.columns where table_name='persons'\` to discover.

## Style of reply

- Concise, informed, useful. Direct answer first, then context.
- Markdown for lists/code/tables. Keep it tight.
- Never write destructive SQL. If asked to "delete" or "update" anything, explain what the query would be but do not run it.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_sql',
    description: 'Execute a read-only SQL query (SELECT or WITH only) against the platform Postgres database and return the rows as JSON. Capped at 500 rows, 5-second statement timeout. Use this whenever the user asks about live data (counts, lookups, "who", "how many", etc.).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A single SELECT or WITH SQL statement. snake_case table and column names. No semicolons, no DML/DDL.'
        }
      },
      required: ['query']
    }
  }
]

async function runSql(query: string): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('admin_read_sql', { query })
  if (error) return { ok: false, error: error.message }
  const rows = Array.isArray(data) ? data : []
  return { ok: true, rows }
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'
const MAX_TURNS = 6

export const POST = async ({ request, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'persons', 'read')

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const body = await request.json() as {
    messages: { role: 'user' | 'assistant'; content: string }[]
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: 'messages array required' }, { status: 400 })
  }

  const origin = new URL(request.url).origin || PUBLIC_APP_URL || 'https://poc.proximity.green'
  const system = buildSystemPrompt(origin) + SYSTEM_PROMPT_BODY

  const convo: Anthropic.MessageParam[] = body.messages.map(m => ({ role: m.role, content: m.content }))
  const toolTrace: { query: string; rowCount: number; error?: string }[] = []
  let totalIn = 0
  let totalOut = 0

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system,
        tools: TOOLS,
        messages: convo
      })
      totalIn += response.usage.input_tokens
      totalOut += response.usage.output_tokens

      convo.push({ role: 'assistant', content: response.content })

      if (response.stop_reason !== 'tool_use') {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('\n')
        return json({
          answer: text,
          toolTrace,
          usage: { input_tokens: totalIn, output_tokens: totalOut }
        })
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        if (block.name === 'run_sql') {
          const q = (block.input as { query?: string }).query ?? ''
          const result = await runSql(q)
          if (result.ok) {
            toolTrace.push({ query: q, rowCount: result.rows.length })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify({ rows: result.rows, row_count: result.rows.length })
            })
          } else {
            toolTrace.push({ query: q, rowCount: 0, error: result.error })
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              is_error: true,
              content: result.error
            })
          }
        }
      }
      convo.push({ role: 'user', content: toolResults })
    }

    return json({
      answer: 'I needed more turns than I was allowed. Try narrowing the question.',
      toolTrace,
      usage: { input_tokens: totalIn, output_tokens: totalOut }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg, toolTrace }, { status: 500 })
  }
}
