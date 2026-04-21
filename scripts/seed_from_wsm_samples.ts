#!/usr/bin/env tsx
/**
 * Seed PG from WSM sample JSON files produced by scripts/export_wsm_samples.sh.
 *
 * Reads the 7+ sample JSON files, maps each WSM row to PG per docs/MIGRATION.md,
 * and upserts by wsm_id (safe to re-run).
 *
 * Usage:
 *   SUPABASE_URL=https://poc.proximity.green \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   WSM_SAMPLES_DIR=/tmp/wsm_prod_samples/wsm_samples_20260421_170449 \
 *   npx tsx scripts/seed_from_wsm_samples.ts
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SAMPLES_DIR = process.env.WSM_SAMPLES_DIR!

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SAMPLES_DIR) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WSM_SAMPLES_DIR')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
})

/** Parse mongoexport --pretty output (one JSON doc per line, concatenated) */
function loadSample(filename: string): any[] {
  const path = join(SAMPLES_DIR, filename)
  const raw = readFileSync(path, 'utf8')
  const docs: any[] = []
  let buf = ''
  let depth = 0
  for (const line of raw.split('\n')) {
    buf += line + '\n'
    for (const ch of line) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
    }
    if (depth === 0 && buf.trim()) {
      try {
        docs.push(JSON.parse(buf))
      } catch (e) {
        console.warn(`Failed to parse doc in ${filename}:`, (e as Error).message)
      }
      buf = ''
    }
  }
  return docs
}

function oid(x: any): string | null {
  if (!x) return null
  if (typeof x === 'string') return x
  if (x.$oid) return x.$oid
  return null
}

function date(x: any): string | null {
  if (!x) return null
  if (typeof x === 'string') return x
  if (x.$date) return x.$date
  return null
}

/** Deterministic UUID5 from a WSM ObjectId so FK lookups are stable across runs. */
import { createHash } from 'node:crypto'
function wsmToUuid(wsmId: string | null): string | null {
  if (!wsmId) return null
  const hash = createHash('sha1').update('wsm:' + wsmId).digest('hex')
  // Format as UUID v5-ish (no namespace compliance needed; just deterministic)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32)
  ].join('-')
}

async function seedLocations() {
  const docs = loadSample('locations_sample.json')
  console.log(`\n[locations] ${docs.length} rows`)

  const rows = docs.map(d => ({
    id: wsmToUuid(oid(d._id))!,
    wsm_id: oid(d._id),
    name: d.name,
    slug: d.urlid || (d.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    short_name: d.short_name,
    description: d.description,
    address_line_1: d.address,
    suburb: d.suburb,
    city: d.city,
    country_code: d.accCountryCode || 'ZA',
    timezone: d.timezone || 'Africa/Johannesburg',
    latitude: d.latitude,
    longitude: d.longitude,
    email: d.email,
    phone: d.phone,
    website: d.website,
    currency: d.accCurrencyCode || 'ZAR',
    logo_url: d.logo,
    hero_image_url: d.room_hero_img,
    map_image_url: d.map_img,
    map_link: d.map_link,
    background_colour: d.background_colour,
    access_instructions: d.access_instructions,
    banking_account_number: d.bank_account,
    banking_bank_code: d.bank_code,
    accounting_external_tenant_id: d.xero_tenant_id,
    accounting_gl_code: d.accGlCode,
    accounting_item_code: d.accItemCode,
    accounting_tax_code: d.accTaxCode,
    accounting_tracking_code: d.accTrackingCode,
    accounting_tracking_name: d.xero_tracking_name,
    accounting_stationery_id: d.accStationeryId,
    accounting_branding_theme: d.xero_branding_theme,
    accounting_tax_type: d.xero_tax_type,
    commercial_tax_percentage: d.commTaxPercentage,
    commercial_app_discount_percentage: d.app_discount,
    headquarters: d.headquarters || false,
    status: d.active === false ? 'inactive' : 'active',
    area_unit: 'sqm'
  }))

  const { error, count } = await supabase
    .from('locations')
    .upsert(rows, { onConflict: 'id' })
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  console.log(`  upserted ${count ?? rows.length}`)
}

async function seedOrganisations() {
  const docs = loadSample('organisations_sample.json')
  console.log(`\n[organisations] ${docs.length} rows`)

  const rows = docs.map(d => {
    const t = Array.isArray(d.type) ? (d.type[0] || 'member') : (d.type || 'member')
    const type = ['member','prospect','supplier','partner','internal'].includes(t) ? t : 'member'
    return {
      id: wsmToUuid(oid(d._id))!,
      wsm_id: oid(d._id),
      name: d.name || 'Unnamed',
      slug: d.urlid || (d.name || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `org-${oid(d._id)?.slice(-8)}`,
      legal_name: d.legal_name,
      short_name: d.short_name,
      company_registration_number: d.company_registration_number,
      vat_number: d.vat,
      logo_url: d.img,
      about: d.about,
      type,
      email: d.email,
      phone: d.tel,
      mobile: d.mobile,
      website: d.website,
      accounting_email: d.accounts_email,
      accounting_address_line_1: d.accAddressLine1 || d.address,
      accounting_address_line_2: d.accAddressLine2,
      accounting_city: d.accCity,
      accounting_postal_code: d.accPostalCode,
      accounting_country_code: d.accCountryCode,
      delivery_address_line_1: d.address,
      status: ['prospect','active','paused','offboarded','inactive'].includes(d.status) ? d.status : 'active',
      started_at: date(d.start_date),
      onboarded_at: date(d.onboard_date),
      offboarded_at: date(d.offboard_date),
      community_visible: true,
      billing_currency: d.currency || 'ZAR'
    }
  })

  const { error } = await supabase.from('organisations').upsert(rows, { onConflict: 'id' })
  if (error) throw error
  console.log(`  upserted ${rows.length}`)
}

async function seedItems() {
  // Get item_type UUIDs (seeded in migration 013)
  const { data: types, error: te } = await supabase.from('item_types').select('id, slug')
  if (te) throw te
  const typeBySlug = Object.fromEntries(types!.map(t => [t.slug, t.id]))

  // products → items (kind=sku or membership)
  const products = loadSample('products_sample.json')
  const memberships = loadSample('memberships_sample.json')
  console.log(`\n[items] ${products.length} products + ${memberships.length} memberships`)

  const productRows = products.map(d => ({
    id: wsmToUuid(oid(d._id))!,
    wsm_id: oid(d._id),
    item_type_id: typeBySlug['sku'],
    location_id: wsmToUuid(oid(d.location_id)),
    name: d.name || 'Unnamed product',
    description: d.description,
    sku: d.sku || d.accItemCode,
    base_price: d.price,
    accounting_gl_code: d.accGlCode || d.xero_account,
    accounting_item_code: d.accItemCode || d.xero_code,
    accounting_tax_code: d.accTaxCode,
    accounting_tax_percentage: d.tax_rate,
    accounting_description: d.accDescription,
    active: d._deleted !== true
  }))

  const memRows = memberships.map(d => {
    let typeSlug = 'membership'
    if (d.occupancy_type === 'dedicated_office') typeSlug = 'office'
    return {
      id: wsmToUuid(oid(d._id))!,
      wsm_id: oid(d._id),
      item_type_id: typeBySlug[typeSlug],
      location_id: wsmToUuid(oid(d.location_id)),
      name: d.name || 'Unnamed membership',
      base_price: d.cost,
      accounting_gl_code: d.accGlCode || d.xero_account,
      accounting_item_code: d.accItemCode || d.xero_itemid,
      accounting_tax_code: d.xero_tax_type,
      accounting_description: d.accDescription,
      active: d._deleted !== true,
      metadata: d.occupancy_type ? { occupancy_type: d.occupancy_type } : null
    }
  })

  const { error } = await supabase.from('items').upsert([...productRows, ...memRows], { onConflict: 'id' })
  if (error) throw error
  console.log(`  upserted ${productRows.length + memRows.length}`)
}

async function main() {
  console.log(`Seeding from ${SAMPLES_DIR}`)
  console.log(`Files:`, readdirSync(SAMPLES_DIR))

  await seedLocations()
  await seedOrganisations()
  await seedItems()

  // TODO as follow-ups (complex FK dependencies):
  //   - persons (users_sample.json)  — wire organisation_id, location_id
  //   - spaces (if present)
  //   - licenses
  //   - subscription_lines
  //   - invoices + invoice_lines
  //   - contracts

  console.log('\nDone.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
