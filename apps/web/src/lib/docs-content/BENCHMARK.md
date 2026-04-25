# Design benchmark — PG billing & subscription model vs industry best practice

Comparison of the Proximity Green schema (items → subscriptions → contracts → invoices) against reference billing systems. Written during the schema design phase so we can spot gaps early and know which parts are novel vs conventional.

**Verdict up front:** sits in the top quartile. Simpler than enterprise ERP, more principled than typical SaaS. Gaps are additive (usage-based billing, dunning, multi-signer) — no current decision blocks future additions.

---

## Model summary

| Table | Purpose |
|---|---|
| `item_types` | Lookup — typed sellability (ad-hoc / recurring / requires-licence) |
| `items` | Unified catalog — products + memberships + adjustments merged |
| `organisations` | Commercial counterparties (customers + suppliers) |
| `locations` | Physical venues; carries accounting tenant + currency |
| `licenses` | Access-right instance for membership-type items (1:1 with recurring sub) |
| `subscription_lines` | Mini-contracts with full lifecycle (option → pending → signed → ended) |
| `subscription_line_rules` | Unified rule engine — escalation, discount, surcharge, rebate |
| `subscription_line_rate_history` | Immutable audit log of rule applications |
| `subscription_option_groups` | Alternative offers to one customer (pick one) |
| `signatures` | E-signature capture with tamper-evident evidence |
| `invoices` | AR + AP unified via `direction` flag |
| `invoice_lines` | Snapshots of money owed — links to sub or item (XOR) |
| `contracts` | Umbrella legal document wrapping many subs |
| `contract_subscription_lines` | M:N junction |
| `wallets` + `wallet_transactions` | Deposit/credit balance and its transaction log |
| `organisation_accounting_customers` | Per-tenant customer IDs for multi-provider accounting |

---

## Benchmark matrix

| Concept | Our design | Stripe Billing | Chargebee | Recurly | Xero / Sage | Enterprise ERP (SAP / Oracle) |
|---|---|---|---|---|---|---|
| Catalog | `items + item_types` (merged) | Products + Prices (split) | Plans + Addons | Plans | Items | Items + Policies |
| Subscription | `subscription_lines` (mini-contract) | Subscription + SubscriptionItem | Subscription | Subscription | Recurring invoice | Sales Order + Contract |
| Quote → Sign → Active | `option → pending → signed` | Subscription Schedule | Quote → Checkout | — (external CPQ) | — | CPQ module |
| Rule engine | Unified `subscription_line_rules` | Coupons + Ramps (separate) | Pricing Rules (separate) | Coupons (separate) | — | Pricing Matrix |
| Rate history | Immutable append-only table | Internal events | Internal events | — | — | Audit tables |
| Amendments | `supersedes_id` chain | Subscription Schedule | Plan Change | Plan Change | — | Contract Version |
| Signature | First-class `signatures` table | Not modelled (defer to DocuSign) | Not modelled | Not modelled | — | Document module |
| Contracts wrapper | `contracts` + M:N junction | Not modelled | Not modelled | Not modelled | — | MSA / Master Agreement |
| AR + AP unified | `invoices.direction` | AR only | AR only | AR only | Both (separate modules) | Unified |
| Credit notes | `invoices.kind` + `parent_invoice_id` | Credit Notes (separate entity) | Credit Notes | Credit Memos | Credit Notes | Same pattern |
| Multi-tenant accounting | Per-location tenant + mapping table | Tenant per account | Site per account | Site per account | Tenant = company file | Company / Business Unit |
| FX lock | Per `invoice_line` at issue | Per invoice | Per invoice | Per invoice | Per invoice | Per transaction |

---

## Where we're stronger than best practice

1. **Unified rules engine.** Discount + escalation + surcharge + rebate in one table, type-driven. Chargebee / Stripe / Recurly each have 2–4 separate tables. Our single-table-with-type is cleaner and matches blueprint v5 intent.

2. **Merged items catalog with typed sellability.** `item_types` flags (`sellable_ad_hoc`, `sellable_recurring`, `requires_license`) beat Stripe's Product/Price bifurcation. Similar to Chargebee but with stricter DB-level enforcement.

3. **DB-enforced exclusive-OR CHECK constraints.** Most SaaS billing systems enforce only at app layer; we enforce at schema. An invalid row literally cannot be inserted. Stronger than typical.

4. **AR + AP unified.** Rare in SaaS billing (which is AR-only). Matches enterprise ERP. Saves building parallel pipelines for supplier invoices.

5. **Proposals-as-subs with states.** Simpler than Stripe's `subscription_schedule` (separate entity). Everything in one table with one state machine.

6. **Signature as first-class.** DocuSign / PandaDoc envelope IDs get captured alongside in-app click-throughs. Many systems defer this to the provider and lose their own audit. We keep tamper-evident evidence (`document_hash`, `evidence jsonb`).

---

## Where we match best practice

- State machine for subs — identical to Stripe / Chargebee
- Immutable rate history — standard pattern
- Version chain via `supersedes_id` — matches Stripe Subscription Schedule
- Contracts wrapping subs — matches enterprise ERP MSA pattern
- Credit notes via `kind` + `parent_invoice_id` — matches Xero / Sage
- Multi-tenant provider mapping — matches FreshBooks / Zoho Books

---

## Gaps vs best practice (intentional for POC, plan later)

1. **No usage-based metering.** Stripe / Chargebee have first-class `usage_records`. Add `subscription_line_usage` table when metered billing is needed. Not blocking.

2. **No `subscription_schedule` for future amendments.** Stripe supports "on Feb 1 2027 raise price to X" as a pre-scheduled event. Our rules engine handles escalation via `next_application_at`, but not arbitrary future structural changes. Could add `subscription_line_amendments (subscription_line_id, effective_at, changes jsonb)` if needed.

3. **No dunning state machine.** Stripe has `past_due`, `unpaid`, `collection_attempts`. We have `paused`, which is coarser. Add `dunning_state` enum on invoices when collections flow matters.

4. **No multi-signer.** Single signature per sub today. Add `signatures_required int` + count check when enterprise joint-signatory requirements arrive.

5. **No tax engine.** We rely on the accounting provider (Xero / Sage) for tax calc. Large SaaS uses Avalara / TaxJar / SOVOS. Fine for a co-working business in SA; add adapter when going multi-jurisdiction heavy.

6. **No explicit "upcoming_invoice" projection endpoint.** Stripe has one. Our rules engine can project deterministically (blueprint v8 line 905 describes it), but we still need to build the endpoint.

---

## Overall assessment

**Sits in the top quartile of billing-system designs** for a platform this size:

- **Simpler** than enterprise ERP (SAP / Oracle) — only ~15 core tables
- **More principled** than typical SaaS (Stripe / Chargebee) — exclusive-OR constraints, unified rules, AR + AP unified
- **More legally grounded** than DIY systems — signatures first-class, tamper-evident audit

Most "best practice" systems in this domain accumulate complexity from bolt-ons over years. We're designing from a mature understanding (12 years of WSM operational data distilled into blueprint v8), so we get the clean version on the first pass. Rare situation where building new beats incrementally reforming.

**Recommendation: lock it in and ship.** The gaps above are additive — no current decision blocks future additions. Schema shape is stable.
