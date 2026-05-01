-- ──────────────────────────────────────────────────────────────────────
-- 060_drop_proposal_unique.sql
--
-- Drop the "one pending proposal per licence" partial unique index from
-- 058. Operators want to draft multiple alternative changes (e.g. two
-- different upgrade paths) and let an admin pick.
--
-- Approval semantics: when one proposal is approved, the
-- approveLicenceProposal service auto-cancels any other 'pending'
-- proposals on the same source_licence_id, since the licence has now
-- changed and they're no longer applicable.
-- ──────────────────────────────────────────────────────────────────────

drop index if exists public.licence_change_proposals_one_open;

notify pgrst, 'reload schema';
