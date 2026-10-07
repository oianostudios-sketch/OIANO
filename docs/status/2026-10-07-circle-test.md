**The Studio Circle concurrency test checks what the product promises, 2026-10-07.** The test
"answers sent together produce one decision" sent accepts and declines at once and expected
exactly one to succeed. But an artist may join after declining and decline after joining, so
when the machine was busy and the answers ran one after another, two succeeded correctly and
the test failed. It failed intermittently on local runs across four changes on 2026-10-07;
CI passed every time.

- **What changed.** The test now sends the same answer five times at once (accepts in even
  rounds, declines in odd ones) and expects exactly one success, with the stored decision
  being that one. The route is unchanged.
- **Evidence.** Integration on a fresh database passes. With the route's status guard removed
  (`updateMany` on the id alone), the test fails: 178 of 180, the failures being this test
  and its parent. Restored from backup, confirmed with `git diff`. Approved by the owner.
- **Not changed.** Weave's "bookings synced at the same moment are all counted" also failed
  once under load on 2026-10-07; it is not investigated here.
