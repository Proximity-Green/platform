# Platform School — Structure & Vision

## What is Platform School?

Platform School is Proximity Green's built-in onboarding and continuous learning programme. It is designed to ensure that every admin, space manager, and member services user develops a confident, working knowledge of the platform — not just through trial and error, but through a structured, self-paced curriculum that grows alongside the platform itself.

Platform School is not a one-time onboarding checklist. It is a living system: as the platform gains new features, new modules and tests are added, and users are expected to keep pace.

## Guiding Principles

- **Learn by asking** — lessons are framed as questions, answered in plain language, grounded in real platform behaviour.
- **Test what you know** — every module has an associated test; completion is tracked and expected.
- **Grow with the platform** — new modules ship with new features; school is never "done".
- **Visible progress** — knowledge level is displayed on the dashboard so teams and admins can see where everyone stands.

## Curriculum Structure

### Modules

The curriculum is organised into modules, each covering a distinct area of the platform. Each module contains:

- A set of guided questions (like the ones surfaced in the AI assistant).
- A short written explanation for each question (published here in Docs).
- A test at the end of the module, consisting of multiple-choice or short-answer questions drawn from the module content.

Modules are grouped into tiers:

| Tier | Audience | Focus |
| --- | --- | --- |
| Foundation | All new users | Core data model, billing concepts, key entities |
| Specialist | Role-specific | Finance, Space Management, Member Services, Platform Owner |
| Advanced | Power users | API, accounting integrations, automation, reporting |

### Module 1 — Foundation: Understanding the Data Model

Recommended for: all new users, before accessing any other part of the platform.

| Lesson | Question |
| --- | --- |
| 1.1 | How do invoice lines snapshot tracking codes? |
| 1.2 | What are subscription lines and how do they compare to invoice lines? |
| 1.3 | What is the difference between an organisation and a person? |
| 1.4 | What is an item type family, and why does it matter? |
| 1.5 | What is a licence, and how does it relate to a membership? |
| 1.6 | What is a wallet and how do wallet transactions work? |
| 1.7 | What is a tracking code, and why is it scoped to a location? |
| 1.8 | How does the platform handle recurring billing? |

**Test:** 10 questions. Pass mark: 80%. Retakes: unlimited.

## Testing

### Philosophy

Tests exist not to gatekeep but to confirm understanding. A user who has read and understood the module content should pass comfortably. Tests are designed to be fair, practical, and directly tied to real platform scenarios — not trick questions.

### How Tests Work

- Each module has a test unlocked once all lessons in that module have been viewed.
- Tests are multiple-choice or short-answer, typically 8–12 questions.
- A pass mark of 80% is required to mark a module as complete.
- Retakes are unlimited — the goal is learning, not failure.
- Results are recorded against the user's profile.
- Over time, as new versions of a module are published, users may be asked to re-sit an updated test to confirm their knowledge is current.

### Expectations

- All new users are expected to complete Module 1 (Foundation) within their first two weeks on the platform.
- Specialist modules should be completed within the first month, relevant to the user's role.
- As new modules ship, users will receive a notification and a reasonable window to complete them.
- Completion status is visible to platform admins.

## The Knowledge Totem — Dashboard Widget

Every user's dashboard will display a **Knowledge Totem**: a visual representation of where they sit in terms of platform knowledge.

### How it works

- The totem is a vertical progress indicator — think of it as a pole with bands or segments, one per completed module.
- Each completed and passed module lights up a new band on the totem.
- Foundation modules form the base; Specialist modules stack above; Advanced modules crown the top.
- Hovering over a band reveals the module name, date passed, and current test version.
- Unfinished or outdated bands are shown dimmed, prompting the user to complete or refresh them.

### Why a totem

The totem is deliberately visual and a little playful. It gives each user a tangible sense of growth, makes knowledge gaps easy to spot at a glance for admins, and reinforces the idea that learning on the platform is ongoing rather than a box to tick.

## Authoring & Maintenance

Platform School content lives alongside the codebase so that new questions and modules become part of the commit process:

- Module content is authored as Markdown in the repo, versioned alongside the features it describes.
- When a feature ships, the PR is expected to include any corresponding lesson updates or new test questions.
- Platform admins can review pending module changes before they are published to users.
- Outdated lessons are flagged automatically when the underlying feature changes materially, prompting a content refresh.

## Roadmap

1. **Phase 1 — Content foundation.** Publish Module 1 (Foundation) in Docs, including written answers to each lesson question.
2. **Phase 2 — Testing engine.** Build the module/test data model, the test-taking UI, and per-user completion tracking.
3. **Phase 3 — Knowledge Totem.** Add the dashboard widget and admin visibility of team-wide knowledge status.
4. **Phase 4 — Specialist & Advanced tiers.** Roll out role-specific curricula and power-user modules.
5. **Phase 5 — Content lifecycle tooling.** Automate the "outdated lesson" signal and the re-sit workflow for updated modules.
