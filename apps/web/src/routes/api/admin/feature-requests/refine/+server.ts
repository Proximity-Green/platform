import Anthropic from '@anthropic-ai/sdk'
import { json } from '@sveltejs/kit'
import { ANTHROPIC_API_KEY } from '$lib/server/env'
import { getUserIdFromRequest, requirePermission } from '$lib/services/permissions.service'

const MODEL = 'claude-sonnet-4-6'

const SYSTEM_PROMPT = `You review draft feature requests for the Proximity Green platform (a coworking / workspace-management SaaS built on SvelteKit + Supabase Postgres).

The platform has these core entities: organisations, persons, locations, items (grouped by family: space / membership / product / service / art / asset), subscription_lines, invoices, tracking_codes, licences, wallets. Members are derived from a person's active licence, not stored on the person.

Your job: read the draft and suggest *small* refinements that make the request clearer and easier to action. Never rewrite from scratch — preserve the author's voice. Prefer concrete, specific wording over platitudes.

Produce three things via the return_refinement tool:
1. A tighter title (only if the current one is ambiguous, too long, or buries the subject). Null if fine.
2. A clearer summary (only if the current one omits key context like *who*, *when*, or *what-for*). Null if fine.
3. Up to 4 considerations — short sentences naming concrete things the author should consider (scope boundaries, edge cases, integration points, security/permissions, existing platform concepts that overlap). Each should be actionable ("What's the expiry behaviour?") not preachy ("Think about security").

If the draft is already good, leave suggestions null and considerations short. Silence is a valid answer.`

const REFINE_TOOL: Anthropic.Tool = {
  name: 'return_refinement',
  description: 'Return the refinement suggestions for the draft feature request.',
  input_schema: {
    type: 'object',
    properties: {
      title_suggestion: {
        type: ['string', 'null'] as any,
        description: 'A tighter, clearer title. Null if the current title is already fine.'
      },
      summary_suggestion: {
        type: ['string', 'null'] as any,
        description: 'A clearer summary. Null if the current summary is already fine.'
      },
      considerations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 4 concrete, actionable considerations. Each a single short sentence.'
      }
    },
    required: ['title_suggestion', 'summary_suggestion', 'considerations']
  }
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

export const POST = async ({ request, cookies, locals }) => {
  const userId = await getUserIdFromRequest(locals, cookies)
  if (userId) await requirePermission(userId, 'feature_requests', 'create')

  if (!ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string
    summary?: string | null
    kind?: 'feature_request' | 'note'
  } | null

  const title = (body?.title ?? '').trim()
  const summary = (body?.summary ?? '').trim()
  const kind = body?.kind === 'note' ? 'note' : 'feature_request'

  if (!title && !summary) {
    return json({ error: 'Title or summary required' }, { status: 400 })
  }

  const userMsg = `Draft ${kind === 'note' ? 'note' : 'feature request'}:

Title: ${title || '(blank)'}
Summary: ${summary || '(blank)'}

Suggest refinements.`

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      tools: [REFINE_TOOL],
      tool_choice: { type: 'tool', name: 'return_refinement' },
      messages: [{ role: 'user', content: userMsg }]
    })

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUse) {
      return json({ error: 'Model did not return structured refinement' }, { status: 502 })
    }
    const input = toolUse.input as {
      title_suggestion: string | null
      summary_suggestion: string | null
      considerations: string[]
    }

    return json({
      title_suggestion: input.title_suggestion?.trim() || null,
      summary_suggestion: input.summary_suggestion?.trim() || null,
      considerations: Array.isArray(input.considerations)
        ? input.considerations.map((s) => s.trim()).filter(Boolean).slice(0, 4)
        : [],
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens }
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, { status: 500 })
  }
}
