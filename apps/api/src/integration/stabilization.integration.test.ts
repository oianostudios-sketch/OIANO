import assert from 'node:assert/strict';
import test from 'node:test';

// Defects that sit where the canonical migration starts building, each held here
// against a real database: a payout carries the currency its money was earned in;
// a rights decision is recorded once and settles its agreement from every decision
// (A04); and an artist's standing counts only evidence someone else confirmed (A07).
test('payouts, rights decisions and standing hold their invariants', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ prisma }, payouts, { postFinancialTransaction }, { respondToNamedRightsShare }, { computeArtistTier }] = await Promise.all([
    import('../lib/prisma'), import('../lib/studioPayout'), import('../lib/financialLedger'),
    import('../lib/rightsDecision'), import('../lib/artistTier'),
  ]);
  t.after(() => prisma.$disconnect());

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const email = (label: string) => `${unique(label)}@example.test`;

  // ── Payouts ────────────────────────────────────────────────────────────────
  const studioPricedIn = (currency: string) =>
    prisma.studio.create({ data: { slug: unique('payout'), name: `Payout studio in ${currency}`, currency } });
  const postPayable = (studioId: string, currency: string, direction: 'CREDIT' | 'DEBIT', amount: number) =>
    postFinancialTransaction(prisma, {
      source_type: 'INTEGRATION_PAYABLE', source_id: unique(studioId), description: 'Integration payable movement', currency,
      lines: direction === 'CREDIT'
        ? [
            { account_code: 'CASH_CLEARING', direction: 'DEBIT', amount_usd: amount },
            { account_code: 'STUDIO_PAYABLE', direction: 'CREDIT', amount_usd: amount, owner_type: 'STUDIO', owner_id: studioId },
          ]
        : [
            { account_code: 'STUDIO_PAYABLE', direction: 'DEBIT', amount_usd: amount, owner_type: 'STUDIO', owner_id: studioId },
            { account_code: 'CASH_CLEARING', direction: 'CREDIT', amount_usd: amount },
          ],
    });

  await t.test('a studio pricing in euros is paid what it earned, in the currency it earned it in', async () => {
    const studio = await studioPricedIn('EUR');
    await postPayable(studio.id, 'USD', 'CREDIT', 120);

    const { payout, outstanding } = await payouts.reserveStudioPayout({ studioId: studio.id, requestedBy: 'integration' });
    assert.equal(outstanding, 120);
    assert.equal(payout.currency, 'USD', "a payout carries the currency its money was earned in, not the studio's");
    const posting = await prisma.financialTransaction.findUniqueOrThrow({
      where: { source_type_source_id: { source_type: 'STUDIO_PAYOUT', source_id: payout.id } },
    });
    assert.equal(posting.currency, 'USD');
    assert.equal((await payouts.studioPayable(studio.id)).amountUsd, 0, 'the whole balance is reserved');
  });

  await t.test('a payable with entries in another currency is refused until reconciled, not paid twice', async () => {
    const studio = await studioPricedIn('EUR');
    await postPayable(studio.id, 'USD', 'CREDIT', 80);
    // How a payout was recorded before this fix: the dollar amount, labelled in the studio's currency.
    await postPayable(studio.id, 'EUR', 'DEBIT', 80);

    await assert.rejects(payouts.reserveStudioPayout({ studioId: studio.id, requestedBy: 'integration' }), /entries in EUR/);
    assert.equal(await prisma.studioPayout.count({ where: { studio_id: studio.id } }), 0, 'nothing is reserved');
  });

  // ── Rights decisions (A04) ────────────────────────────────────────────────
  const producerUser = await prisma.user.create({
    data: { email: email('rights-producer'), role: 'PRODUCER', producer: { create: { name: 'Rights Producer' } } },
    include: { producer: true },
  });
  const holders = (count: number) =>
    Promise.all(Array.from({ length: count }, () => prisma.user.create({ data: { email: email('holder'), role: 'ARTIST' } })));
  const agreementFor = async (people: Array<{ id: string }>) => {
    const project = await prisma.project.create({ data: { producer_id: producerUser.producer!.id, title: unique('rights-project') } });
    return prisma.rightsAgreement.create({
      data: {
        project_id: project.id, agreement_type: 'MASTER', title: 'Master split', created_by: producerUser.id,
        decisions: { create: people.map((person, index) => ({ holder_user_id: person.id, holder_name: `Holder ${index + 1}` })) },
      },
    });
  };

  await t.test("a holder's decision is recorded once, however many answers arrive together", async () => {
    // Two answers must overlap to collide, and timing decides that, so they get several chances.
    for (let round = 1; round <= 6; round += 1) {
      const [first, second] = await holders(2);
      const agreement = await agreementFor([first, second]);
      const answers = await Promise.allSettled([
        respondToNamedRightsShare({ agreementId: agreement.id, userId: first.id, action: 'APPROVE' }),
        respondToNamedRightsShare({ agreementId: agreement.id, userId: first.id, action: 'DISPUTE', note: 'The split is wrong' }),
      ]);
      assert.equal(answers.filter((answer) => answer.status === 'fulfilled').length, 1, `round ${round}: exactly one answer is recorded`);
      const refusal = answers.find((answer): answer is PromiseRejectedResult => answer.status === 'rejected');
      assert.match(String(refusal?.reason?.message), /already been recorded/);

      const recorded = await prisma.rightsDecision.findUniqueOrThrow({
        where: { agreement_id_holder_user_id: { agreement_id: agreement.id, holder_user_id: first.id } },
      });
      const settled = await prisma.rightsAgreement.findUniqueOrThrow({ where: { id: agreement.id } });
      assert.equal(settled.status, recorded.status === 'DISPUTED' ? 'DISPUTED' : 'PROPOSED', `round ${round}: the agreement follows the answer recorded`);
    }
  });

  await t.test('holders answering at the same moment settle their agreement from every decision', async () => {
    for (let round = 1; round <= 8; round += 1) {
      const people = await holders(3);
      const agreement = await agreementFor(people);
      await Promise.all(people.map((person) => respondToNamedRightsShare({ agreementId: agreement.id, userId: person.id, action: 'APPROVE' })));
      const settled = await prisma.rightsAgreement.findUniqueOrThrow({ where: { id: agreement.id } });
      assert.equal(settled.status, 'APPROVED', `round ${round}: every holder approved, so the agreement is approved`);
      assert.ok(settled.effective_at, `round ${round}: and it took effect`);
    }
  });

  // ── Standing (A07) ─────────────────────────────────────────────────────────
  const tierStudio = await prisma.studio.create({ data: { slug: unique('tier'), name: 'Tier Studio' } });
  const tierRoom = await prisma.room.create({ data: { studio_id: tierStudio.id, name: 'Tier Room' } });
  const tierService = await prisma.serviceOffering.create({
    data: { studio_id: tierStudio.id, category: 'RECORDING', name: 'Tier Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour' },
  });
  const engineers = await Promise.all([1, 2, 3].map((n) =>
    prisma.engineer.create({ data: { studio_id: tierStudio.id, name: `Tier Engineer ${n}`, specialties: [] } })));
  let slot = 0;
  // Ten completed sessions with three engineers: enough for PRECIOUS when the ratings count.
  const artistWithSessions = async (label: string, ratings: { byEngineer?: number; byArtist?: number }) => {
    const user = await prisma.user.create({
      data: {
        email: email(label), role: 'ARTIST',
        artist: { create: { name: label, passport: { create: { passport_code: unique('OIA').toUpperCase(), profile_strength: 70 } } } },
      },
      include: { artist: true },
    });
    for (let session = 0; session < 10; session += 1) {
      slot += 1;
      const starts_at = new Date(Date.now() - 400 * 86_400_000 + slot * 2 * 3_600_000);
      const booking = await prisma.booking.create({
        data: {
          studio_id: tierStudio.id, artist_id: user.artist!.id, room_id: tierRoom.id, service_id: tierService.id,
          engineer_id: engineers[session % 3].id, starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000),
          total_usd: 50, status: 'COMPLETED',
        },
      });
      await prisma.sessionLog.create({
        data: { booking_id: booking.id, artist_id: user.artist!.id, quality_rating: ratings.byEngineer ?? null, artist_rating: ratings.byArtist ?? null },
      });
    }
    return user.artist!;
  };

  await t.test('standing counts the ratings engineers gave the sessions, not the ratings the artist gave', async () => {
    const ratedByEngineers = await artistWithSessions('rated-by-engineers', { byEngineer: 5 });
    const ratingEngineers = await artistWithSessions('rating-engineers', { byArtist: 5 });
    assert.equal(await computeArtistTier(ratedByEngineers.id), 'PRECIOUS');
    assert.equal(await computeArtistTier(ratingEngineers.id), 'CUT', 'what an artist thinks of their engineers is not evidence of the artist');
  });

  await t.test('a connection counts toward standing only once it is accepted', async () => {
    const soughtAfter = await artistWithSessions('sought-after', { byEngineer: 5 });
    const admirers = await Promise.all([1, 2].map((n) => prisma.user.create({
      data: { email: email(`admirer-${n}`), role: 'ARTIST', artist: { create: { name: `Admirer ${n}` } } },
      include: { artist: true },
    })));
    const requests = await Promise.all(admirers.map((admirer) =>
      prisma.passportConnection.create({ data: { initiator_id: admirer.artist!.id, recipient_id: soughtAfter.id } })));

    assert.equal(await computeArtistTier(soughtAfter.id), 'PRECIOUS', 'requests nobody accepted are not relationships');
    await prisma.passportConnection.updateMany({ where: { id: { in: requests.map((request) => request.id) } }, data: { status: 'ACCEPTED' } });
    assert.equal(await computeArtistTier(soughtAfter.id), 'TRADED');
  });
});
