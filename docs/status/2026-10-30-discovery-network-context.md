**Discovery and Network now distinguish profile descriptions, recorded work context and proposed participation, using existing reads rather than inventing a graph or opportunity board.**

The owner selected an audit and improvement of existing discovery/network views,
reserving SKY naming for the gated canonical step. No opportunity publishing
contract was selected or implemented.

## Audit and changes

- [EcosystemNetworkPage.tsx](../../apps/web/src/pages/EcosystemNetworkPage.tsx):
  the old linked role-pole illustration described account categories rather than
  actual participants. The page now leads with the caller's existing work-context
  read and discovery/invitation links. The role guide is explicitly explanatory,
  closed by default, and no longer draws a connecting line between categories.
- [MyOrbit.tsx](../../apps/web/src/components/MyOrbit.tsx): the existing orbit
  response supplies labels from one selected project or booking, without entity
  IDs, evidence, activity status or pairwise relationship records. Replaced the
  connected-chain presentation with a labelled context list and an explicit
  non-verification notice. It does not fabricate edges or profile links.
  Loading, failure/retry, stale cached data, empty and operational perspectives
  are now distinguishable. A profile alone is not presented as a relationship.
- [DiscoverPage.tsx](../../apps/web/src/pages/DiscoverPage.tsx):
  removed displayed profile-strength percentages, numeric overlap badges and
  rarity marks from this surface. Stored energy descriptions remain optional
  filters, displayed without assigning a friendly personality identity. Added
  provenance copy and links to professional catalogues, Network and invitations.
  Profile/connection navigation uses encoded native links and retains the
  artist-only connection boundary.
- The discovery API and its order are unchanged: up to 20 results, ordered by
  shared genres/themes and complementary vocal descriptors, then completed
  bookings and stable ID. Search now explicitly searches loaded profiles, not an
  implied complete network index. The UI explains the selection and does not
  present it as a quality/trust score.
- [DiscoverPage.css](../../apps/web/src/pages/DiscoverPage.css):
  removed the sticky discovery header that could sit behind the fixed studio
  ticker, improved supporting text contrast, and retained visible focus and
  wrapping. Search has a field name/autocomplete setting and result counts have
  a live announcement.
- [creatorNavigation.ts](../../apps/web/src/lib/creatorNavigation.ts):
  Network belongs to People selection; no new tab or route was added.
- [networkPoles.ts](../../apps/web/src/lib/networkPoles.ts):
  corrected "Discover studios" to "Discover artists" for its actual destination.

## Evidence

- Before implementation, six focused regressions failed for context rendering,
  read failure/retry, cached stale data, loading/empty perspectives, the Network
  composition and discovery provenance/destinations.
- Automated coverage also preserves artist-only connection actions and verifies
  Network's People navigation selection.
- Final web suite: **28 files, 254 tests passed**.
- Web typecheck and production web build passed.
- Repository secrets scan passed across 594 tracked files; whitespace check passed.
- Browser using explicit synthetic HTTP fixtures: Network and Discover at
  **320, 390 and 1440 px**, without horizontal overflow. A long work title wrapped.
- Browser verified context entries, Network-to-Discover and Discover-to-Network
  navigation, encoded profile/request links, filtered empty state and clearing,
  keyboard guide disclosure, visible solid focus outline, and absence of numeric
  strength/match presentation.
- Browser professional perspective did not expose artist-only connection actions.

## Isolation and cleanup

The preview used only a frontend server and a synthetic fixture server. It did
not start the API application, use any database URL or call external integrations.
Synthetic browser auth was cleared, the page returned to entry, and task-owned
servers and the temporary fixture script were removed/stopped.

## Not exercised

No live database-backed journey or production deployment. Browser fixtures do not
prove backend authorization, relationship provenance or real-world opportunity
availability. Those contracts were not changed.

## Remaining boundaries

- The existing Weave registry supports artist/studio references and
  completed-booking evidence; this change does not expose it as a public graph
  or add universal node types.
- Orbit remains one context, not a complete network. Existing role-specific
  selection can include incomplete/cancelled booking context; the presentation
  deliberately makes no completed-work claim.
- No opportunity creation, persistence, search, visibility or lifecycle was added.
  Private contribution invitations are explicitly not a public opportunity board.
  Canonical Requirement, identity and organization work remain behind the frozen
  migration order and stabilization gate.
- Legacy role-guide copy and metrics styling still contain low-contrast text.
  This is not a full application accessibility sign-off.
- Professional catalogue search and current discovery's 20-result limit remain
  existing constraints, not a new unified search implementation.
