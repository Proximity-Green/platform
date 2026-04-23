# Sage meeting — prep

**Date:** 2026-04-24
**Goal:** decide whether Sage is the right accounting system for Workshop17 SA, and understand the integration surface for the Proximity Green platform.

## Context to share with the Sage rep up front

Keep this short — set the stage in 60 seconds so they answer the right questions:

- **Workshop17** — coworking / workspace-management business, South Africa + Mauritius.
- **What's changing.** Consolidating from 8 Xero organisations (legacy setup) into **one Sage instance** covering all of W17 SA. Mauritius stays separate (will run on Microsoft Dynamics).
- **Legal structure.** ~4 legal entities in SA (HQ plus entities with different shareholders at some locations). All 4 need to live inside the single Sage instance as separate companies.
- **Custom platform.** We're building a workspace-management platform (Proximity Green) that will integrate with Sage via API — it creates customers, issues invoices, reconciles payments, and pulls reporting data.
- **Group management reporting.** Even though legal entities have their own books, W17 manages as one group. Consolidated monthly management reporting (MMR) across all companies is non-negotiable, via *tracking codes* (location, product line, etc.).
- **Scale.** Today: hundreds of members, thousands of invoices/month. Headroom needed for 10× growth over 3 years.

## Concepts — an idiot's guide

Four things get confused. They're not the same thing. They answer different questions:

| Concept          | Answers the question…              | Example                              |
| ---------------- | ---------------------------------- | ------------------------------------ |
| **Legal entity** | *Whose books? Who pays SARS?*      | Refuel Properties (Pty) Ltd          |
| **Location**     | *Where is the service delivered?*  | KL (Kloof), ST, 20 Kloof Street      |
| **Organisation** | *Who are we invoicing?*            | Acme Corp (a client company)         |
| **Tracking code**| *How do we slice & dice reports?*  | Location=KL, Product=Hot Desk        |

### How they relate

```
Legal entity (the company that owns the books)
    │
    │  owns…
    ▼
Location (a physical coworking space)
    │
    │  hosts members (via their active licence)…
    ▼
Person (a member)  ← may or may not be affiliated with…
    │
    ▼
Organisation (the client company being invoiced)
```

- A **legal entity** owns one or more **locations**. The location can't float free of a legal entity — every address has a legal owner.
- A **person** uses a location via their active licence. Their "region" and their billing legal entity both come from that location.
- An **organisation** is the *customer* on the invoice. A person and their employing organisation are different things — the person uses the space; the organisation pays the bill (sometimes; sometimes the person pays in their own name).
- **Tracking codes** are not a structural thing — they're *tags* stuck on invoice and journal lines so we can run reports that slice across the whole group.

### Why tracking codes matter (and why they're not just "location")

Location is already a structural concept — each location belongs to exactly one legal entity. So "revenue by location" is a structural query.

Tracking codes give us dimensions that **cut across** legal entities and locations — the axes we want to slice by that aren't already in the hierarchy:

- **Product line** — Hot Desk vs Dedicated Desk vs Private Office vs Meeting Room vs Events. A single location (KL) sells all of these. A single legal entity (Refuel) spans multiple locations, each selling the mix.
- **Sales channel** — Direct vs Partner vs Marketplace. Cuts across every location and every legal entity.
- **Marketing campaign** — which campaign drove this revenue? Cuts across everything.
- **Location as a tracking code too** — so group-level reports can slice by location *across all Sage companies* in one pass, without joining across company boundaries.

### Worked example — one member's invoice

Scenario: *Alice works for Acme Corp and has a Hot Desk licence at KL (Kloof). Alice's monthly invoice is R2,500 + VAT.*

1. **Legal entity issuing the invoice:** Refuel Properties (Pty) Ltd (because Refuel owns KL).
2. **Customer on the invoice:** Acme Corp (the organisation that pays for Alice's desk).
3. **Location where the service is delivered:** KL.
4. **Product line:** Hot Desk.
5. **Channel:** Direct.

In Sage, this invoice is:
- Booked inside the **Refuel Properties company** (one of the ~4 companies in our Sage instance).
- Raised against the **customer record** for "Acme Corp" that lives inside the Refuel company.
- Tagged with tracking codes: `Location=KL`, `Product=Hot Desk`, `Channel=Direct`.

Group reporting later can ask:
- *Total Hot Desk revenue for the group this month?* → query all companies, sum of invoices where `Product=Hot Desk`.
- *Revenue by location this month?* → group by tracking `Location` across all companies.
- *Statutory P&L for Refuel Properties?* → standard report inside the Refuel company only, no tracking-code filter needed.

### The mental check

If you're unsure where something belongs, ask:

- "*Who signs contracts and pays tax on this?*" → **legal entity**.
- "*Where does this physically happen?*" → **location**.
- "*Who receives the invoice?*" → **organisation**.
- "*What do I want to slice the report by?*" → **tracking code**.

## Current SA legal-entity / location map

Reference for the Sage rep so they can see the multi-company structure we need configured in one Sage instance.

| Legal entity                   | Locations           |
| ------------------------------ | ------------------- |
| Refuel Properties (Pty) Ltd    | ST, KL, RFS, NCG    |
| BCT                            | PA                  |
| Rozenhof                       | 20 Kloof            |
| W17 Cradock                    | BANK                |
| *(TBD — confirm with finance)* | HPC, CC, MZ         |

_Notes:_

- The top four rows are confirmed. The fifth row is an open item: each of HPC, CC and MZ may sit in its own legal entity, or share one. Needs confirmation from the finance team before the Sage setup is finalised.
- Count of legal entities at launch: **4 confirmed + up to 3 pending** = potentially 5–7.
- Each row above becomes **one company inside the Sage instance.** Locations roll up to their legal entity for statutory accounts; the group P&L reports across all companies via tracking codes.
- Location full names / addresses to be filled in before the meeting (legend below) so the Sage rep isn't parsing abbreviations.

### Location-code legend — to complete before the meeting

| Code      | Location (full name / address) |
| --------- | ------------------------------ |
| ST        | _fill in_                      |
| KL        | _fill in_                      |
| RFS       | _fill in_                      |
| NCG       | _fill in_                      |
| PA        | _fill in_                      |
| 20 Kloof  | 20 Kloof Street                |
| BANK      | _fill in_                      |
| HPC       | _fill in_                      |
| CC        | _fill in_                      |
| MZ        | _fill in_                      |

## Questions by theme

Questions are ordered so the highest-risk answers ("no" here means Sage doesn't fit) come first.

### 1. Product & edition

- Which **Sage product** is being proposed? Sage Intacct, Sage 200, Sage 300, Sage Business Cloud? Why this one for us?
- Does this edition natively support **multiple companies in one instance** (our 4 SA legal entities, plus headroom)?
- Is there a hard limit on companies per instance?
- Can different companies have **different fiscal year-ends**? (At least one of our entities is likely on a non-standard year-end.)
- Is the product available as a cloud SaaS, or is any component on-prem?

### 2. Multi-company architecture ⚑ critical

- One instance, N companies — how does **user access** work? Can a user be granted access to only company A and C, not B?
- What is **shared across companies** and what is **per-company**: chart of accounts, customers, products/services, tax codes, tracking codes?
- If charts of accounts are per-company, can we enforce a shared template across them (so group reports reconcile)?
- **Intercompany transactions** — natively supported? Automatic mirror entries on the counterparty company? Auto-elimination on group reports?
- Can we add or remove a company later without disruption (e.g. a new franchise comes online)?

### 3. Tracking codes / dimensions ⚑ critical

This is the axis our group reporting depends on.

- Does Sage support **tracking categories / dimensions** on invoice lines and journal entries?
- Are they **consistent across all companies** in the instance (i.e. the same tracking-code taxonomy applies everywhere)? Or per-company?
- **How many dimensions** are supported simultaneously? We expect to use: Location, Product (hot desk / dedicated / private office / meeting room / events), Sales Channel.
- Can tracking codes be set **via API** on every invoice line and journal line?
- Can we **report by tracking code** across all companies in one pass? (E.g. "show me Rosebank revenue across all legal entities this month.")
- Are tracking-code reports available via **API** for pulling into our own dashboards?

### 4. API / integration surface ⚑ critical

- Is the API **full-coverage** for the following (our adapter needs each one)?
  - Create / update customer (contact)
  - Create invoice with line items, tax, discounts, tracking codes
  - Create credit note
  - Record payment / payment allocation
  - Read customer balance
  - Read invoice status + payment history
  - Read tracking-code-scoped reports
- **Auth model:** OAuth 2.0, API keys, or per-company static credentials? (OAuth preferred; per-company static is workable but annoying.)
- **Rate limits:** per second / per minute / per day? For bulk operations (e.g. month-end invoice generation for ~1000 members) what do we need to throttle at?
- **Sandbox environment** for dev + staging testing — is it free, and does it mirror production feature-for-feature?
- **Webhooks / push events** — payment received, invoice paid, customer updated? Or are we polling?
- Is there a maintained **Node / TypeScript SDK**, or is it raw REST?
- Is API access **included** in the subscription or priced separately (per call, tiered)?

### 5. Data model & master data

- **Customer deduplication** — what prevents creating the same customer twice? What's the natural key — email, our external ID, tax number?
- Is there an **external reference field** on customers (and invoices) that we can write our platform UUIDs into for bidirectional mapping?
- **Products / services catalog** — flat or hierarchical? Per-company or shared?
- Is **recurring billing** a first-class feature, or do we handle recurrence ourselves and push per-period invoices?
- **Multi-currency** — if a SA company needs to invoice in USD or EUR for international clients, is that supported?
- **SA tax codes** — VAT 15%, zero-rated, exempt — setup complexity?

### 6. Group reporting (MMR)

- What **canned consolidated reports** ship out of the box (group P&L, group balance sheet, group cash flow)?
- Is there a **custom report builder**? What's the learning curve?
- Are all reports available via **API** (JSON or at least downloadable CSV)?
- Can we **schedule reports** to be emailed or pushed to an endpoint?
- Is the reporting data **real-time**, or is there an EOD / nightly batch?
- What does a **"different year-ends" MMR** look like in practice — does the product support calendar-month group reporting independent of statutory year-end boundaries?

### 7. Intercompany handling

Our cross-region services (SA provides a service consumed in MU, or vice versa) need shared-revenue splits.

- When we record a transaction between two companies in the same instance, can Sage **auto-create the mirror journal** on the other company?
- If not, what's the recommended manual workflow?
- Do **consolidation reports automatically eliminate intercompany** balances?
- How are intercompany FX differences handled if companies are in different currencies? (Relevant if we ever re-combine ZA+MU later.)

### 8. Implementation & migration

- We're going **greenfield** — no historical data migration. Can you recommend a **chart of accounts template** for a coworking / membership-revenue business?
- Does Sage have an **implementation partner** in Cape Town / Johannesburg?
- What's the **typical implementation timeline** for a 4-company setup with custom API integration?
- **Training** — format (self-serve, classroom, on-site), cost?
- Sandbox → production **config promotion path** — can we export setup from sandbox and apply to prod?

### 9. Compliance, audit, security

- **Audit log** — who changed what, when, on which company? Is it immutable? API-accessible?
- **Role-based access control** — how fine-grained? Per-company, per-feature, per-record?
- **Data residency** — where is our data hosted? (POPIA compliance matters in SA.)
- **Backup / DR** — RPO and RTO?
- **Certifications** — SOC 2, ISO 27001?
- Any **support for SARS eFiling** integration (VAT201, EMP201)?

### 10. Commercial

- **Pricing model** — per user, per company, per transaction, flat, bundle?
- Does **API access** cost extra?
- **Implementation / onboarding fees** — one-off?
- **Contract minimum term** and exit terms. On exit, what **data export** is provided (format, completeness)?
- **SLA** — uptime guarantee?
- **Support tiers** — response time, phone vs email, 24/7 or business hours?

## Walkaway criteria

If the answers to any of these are "no" or "extra cost", Sage is probably not the right fit and we should reopen the decision:

- ✗ No tracking codes on invoice / journal lines via API
- ✗ Tracking codes are per-company only (breaks group reporting)
- ✗ Per-company user licensing that scales linearly with our 4 entities
- ✗ API is a premium add-on costing more than the base subscription
- ✗ Rate limits under ~60 calls/minute
- ✗ No sandbox environment
- ✗ Data hosted outside SA without a POPIA-compliant arrangement
- ✗ Intercompany has no elimination — every group report needs manual reconciliation

## Things we'll have to tell Sage in return

They'll want to understand us too — be ready to share:

- Member and invoice volume today + 3-year projection
- Integration language and stack (Node / TypeScript, SvelteKit, self-hosted Supabase)
- Go-live target date for the platform's Sage integration
- Whether we have an internal technical lead for the integration
- Existing Xero structure (so they can scope the cutover)

## Follow-up checklist after the meeting

- [ ] Sage product decided (edition + justification)
- [ ] Commercial quote requested in writing
- [ ] API docs URL received
- [ ] Sandbox access requested
- [ ] Implementation partner named + intro'd
- [ ] Tracking-code taxonomy sketch agreed with W17 accounting team
- [ ] Draft chart-of-accounts template received
- [ ] SLA and contract terms received in writing
