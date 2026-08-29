# Authenticated Role Release QA

Status legend: AUTOMATED, VISUAL-PENDING, PASS, FAIL, BLOCKED.

| Role | Required journey | Permission assertions | Desktop/mobile/a11y |
|---|---|---|---|
| Artist | sign in → dashboard; representative booking, project and Passport links render | `/maintenance` denied with an explicit Artist access boundary | PASS (desktop/mobile smoke and landmark audit) |
| Producer | sign in → producer board; project, discovery and Passport actions render | `/maintenance` denied with an explicit Creative Professional access boundary | PASS (desktop/mobile smoke and landmark audit) |
| Engineer | sign in → assigned-work dashboard; Calendar and Runsheet links render | `/maintenance` denied with an explicit Creative Professional access boundary | PASS (desktop/mobile smoke and landmark audit) |
| Studio operator | sign in → command centre; Pulse, Calendar, Runsheet, roster and booking filters render | `/maintenance` denied with an explicit Studio Operator access boundary | PASS (desktop/mobile smoke and landmark audit) |
| Collaborator identity | invitation decision → active contribution room → project conversation → credit/rights decision | only the invited identity or matching account email can access; accepted membership required for workspace | PASS (API security tests plus desktop/mobile empty-state and landmark audit) |
| OIANO administrator | password accepted → MFA challenge | privileged workspace remains inaccessible without the authenticator factor | BLOCKED at MFA by design; MFA screen passes desktop/mobile landmark and label smoke checks |

Automated release checks: shared/API/web production builds; 53 unit/security/intelligence tests; and a passing disposable Neon integration journey for authentication, booking, wallet payment, balanced ledger, studio policies and exceptions, session completion, contributions, credits, rights, live role metrics, tenant isolation and role denial. The verified audit schema is `oiano_test_20260828`.

Unauthenticated `/enter` check: desktop and mobile have no horizontal overflow, one main landmark, labelled email/password fields and an accessible name for the password visibility control.

Authenticated browser QA was performed on 2026-08-25 after explicit approval to enter local demo credentials. The smoke pass covered approximately 390×844 and 1440×900, horizontal overflow, main/H1 landmarks, control labels, image alternatives, role landing surfaces and a representative forbidden route. It found and corrected: an artist mobile header overflow, a producer dashboard missing its `main` landmark, an engineer dashboard missing an H1, and a studio mobile booking-filter overflow plus an unlabelled roster-search field.

Release QA still requires the deeper interaction pass: keyboard-only navigation, visible focus, dialog focus/escape, 200% zoom, reduced motion, real mutation workflows, empty/error/loading states, and an authorised current TOTP for the OIANO administrator. The transient Vite parse errors observed while applying the producer landmark fix were development hot-reload errors; the final production build is the release authority for that correction.

Collaborator refinement on 2026-08-25 made the project-level identity experience a first-class destination without introducing a conflicting global database role. Every account family now exposes **Contribute** in mobile navigation. The contribution record presents pending decisions, active project rooms, confirmed credits and linked sessions, while accepted rooms retain conversation, deliverables, credit confirmation and identity-bound rights decisions. Global focus-visible and reduced-motion safeguards now apply across all account families.
