/**
 * Smart-error sub-system.
 *
 * Endpoints surface failures as ActionableError so the UI can render a
 * consistent banner with suggested next-steps. Two ways in:
 *
 * 1. Reactive: catch a raw error, run it through translate() — string
 *    matchers identify the failure mode and enrich with names, locations,
 *    etc. so the user sees something actionable.
 *
 *      try { ... } catch (e) {
 *        const err = await translate(e)
 *        emit({ phase: 'error', error: err })
 *      }
 *
 * 2. Proactive: before doing the operation, look up problematic refs and
 *    short-circuit with an ActionableError if any are soft-deleted /
 *    missing / locked. Cleaner UX since the error is reported on input,
 *    not after a partially-applied failure.
 *
 *      const dead = await findSoftDeleted('tracking_codes', tcIds)
 *      if (dead.length > 0) {
 *        emit({ phase: 'error', error: softDeletedRefError('tracking_codes', dead) })
 *        return
 *      }
 *
 * Adding a new error pattern:
 *   - Write a Matcher under ./matchers/<name>.ts
 *   - Append it to the matchers array in ./translator.ts
 *   - That's it. Every endpoint that already calls translate() picks it up.
 *
 * See docs/ERRORS.md for conventions and best practices.
 */

export type { ActionableError, ErrorAction, Matcher, MatcherContext } from './types'
export { translate, translateToJson } from './translator'
export { findSoftDeleted, softDeletedRefError } from './helpers/find-soft-deleted'
export type { SoftDeletedRef } from './helpers/find-soft-deleted'
