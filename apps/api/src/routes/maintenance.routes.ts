import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { auditMaintenanceAccess } from '../lib/adminAudit';
import { findWalletDrift } from '../lib/walletLedger';

export const maintenanceRouter = Router();

maintenanceRouter.use(authenticate, requireRole('OIANO_ADMIN'));
maintenanceRouter.use(auditMaintenanceAccess);

maintenanceRouter.get('/audit', async (req: any, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 250);
    const logs = await prisma.adminAuditLog.findMany({
      orderBy: { created_at: 'desc' }, take: limit,
      include: { actor: { select: { email: true, role: true } } },
    });
    res.json(logs.map(({ actor, ...log }) => ({ ...log, actor_email: actor.email, actor_role: actor.role })));
  } catch (error) { next(error); }
});

maintenanceRouter.get('/summary', async (_req, res, next) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);

    const [
      studios,
      artists,
      producers,
      studioStaff,
      bookings,
      completedBookings,
      paidRevenue,
      failedPayments,
      newCreators30d,
      bookings30d,
      recentUsers,
      recentBookings,
      liveSessions,
      pendingBookings,
      processingPayments,
    ] = await Promise.all([
      prisma.studio.count(),
      prisma.artist.count(),
      prisma.producer.count(),
      prisma.studioStaff.count(),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'COMPLETED' } }),
      prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount_usd: true } }),
      prisma.payment.count({ where: { status: 'FAILED' } }),
      prisma.user.count({ where: { role: { in: ['ARTIST', 'PRODUCER'] }, created_at: { gte: thirtyDaysAgo } } }),
      prisma.booking.count({ where: { created_at: { gte: thirtyDaysAgo } } }),
      prisma.user.findMany({
        where: { role: { in: ['ARTIST', 'PRODUCER'] }, created_at: { gte: sevenDaysAgo } },
        select: { created_at: true },
      }),
      prisma.booking.findMany({
        where: { created_at: { gte: sevenDaysAgo } },
        select: { created_at: true },
      }),
      prisma.booking.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.payment.count({ where: { status: 'PROCESSING' } }),
    ]);

    const activity = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now.getTime() - (6 - index) * 86_400_000).toISOString().slice(0, 10);
      return { date, creators: 0, bookings: 0 };
    });
    for (const user of recentUsers) {
      const bucket = activity.find((day) => day.date === user.created_at.toISOString().slice(0, 10));
      if (bucket) bucket.creators += 1;
    }
    for (const booking of recentBookings) {
      const bucket = activity.find((day) => day.date === booking.created_at.toISOString().slice(0, 10));
      if (bucket) bucket.bookings += 1;
    }

    res.json({
      generated_at: now.toISOString(),
      network: { studios, artists, producers, creators: artists + producers, studio_staff: studioStaff, live_sessions: liveSessions },
      business: {
        bookings,
        completed_bookings: completedBookings,
        paid_revenue_usd: Number(paidRevenue._sum.amount_usd ?? 0),
        failed_payments: failedPayments,
        new_creators_30d: newCreators30d,
        bookings_30d: bookings30d,
        pending_bookings: pendingBookings,
        processing_payments: processingPayments,
      },
      activity,
      system: { api: 'OPERATIONAL', database: 'CONNECTED' },
    });
  } catch (error) {
    next(error);
  }
});

maintenanceRouter.get('/studios', async (_req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
    const studios = await prisma.studio.findMany({
      orderBy: { created_at: 'asc' },
      include: {
        rooms: { select: { id: true, name: true } },
        engineers: { select: { id: true, name: true } },
        staff: { include: { user: { select: { email: true, role: true } } } },
        bookings: {
          select: { id: true, status: true, created_at: true, payment: { select: { status: true, amount_usd: true } } },
        },
      },
    });

    res.json(studios.map((studio) => {
      const paidVolume = studio.bookings.reduce((sum, booking) => booking.payment?.status === 'PAID' ? sum + Number(booking.payment.amount_usd) : sum, 0);
      const operator = studio.staff.find((member) => member.role === 'STUDIO_ADMIN');
      const liveSessions = studio.bookings.filter((booking) => booking.status === 'IN_PROGRESS').length;
      const recentBookings = studio.bookings.filter((booking) => booking.created_at >= thirtyDaysAgo).length;
      const completed = studio.bookings.filter((booking) => booking.status === 'COMPLETED').length;
      return {
        id: studio.id, slug: studio.slug, name: studio.name, address: studio.address, timezone: studio.timezone,
        currency: studio.currency, email: studio.email, created_at: studio.created_at,
        operator: operator?.user.email ?? null,
        rooms: studio.rooms, engineers: studio.engineers,
        team_count: studio.staff.length, booking_count: studio.bookings.length, bookings_30d: recentBookings,
        completed_bookings: completed, live_sessions: liveSessions, paid_volume: paidVolume,
        status: liveSessions > 0 ? 'LIVE' : 'ONLINE',
      };
    }));
  } catch (error) { next(error); }
});

maintenanceRouter.get('/operators', async (_req, res, next) => {
  try {
    const [studios, operators] = await Promise.all([
      prisma.studio.findMany({ orderBy: { name: 'asc' }, select: { id:true, name:true, slug:true, email:true, rooms:{select:{id:true}}, bookings:{select:{status:true}} } }),
      prisma.studioStaff.findMany({ where: { role:'STUDIO_ADMIN' }, include: { studio:{select:{id:true,name:true,slug:true}}, user:{select:{id:true,email:true,created_at:true,mfa_enabled:true}} } }),
    ]);
    const assignedIds=new Set(operators.map(operator=>operator.studio_id));
    res.json({
      totals:{studios:studios.length,operators:operators.length,covered_studios:assignedIds.size,unassigned_studios:studios.length-assignedIds.size,mfa_enabled:operators.filter(operator=>operator.user.mfa_enabled).length},
      operators:operators.map(operator=>({id:operator.id,user_id:operator.user.id,email:operator.user.email,joined_at:operator.user.created_at,mfa_enabled:operator.user.mfa_enabled,studio:operator.studio})),
      studios:studios.map(studio=>({id:studio.id,name:studio.name,slug:studio.slug,email:studio.email,rooms:studio.rooms.length,active_bookings:studio.bookings.filter(booking=>!['COMPLETED','CANCELLED','NO_SHOW'].includes(booking.status)).length,operator_assigned:assignedIds.has(studio.id)})),
      capabilities:{invitations:false,last_login_tracking:false,operator_mfa_enforcement:false},
    });
  } catch(error){next(error);}
});

maintenanceRouter.get('/creators', async (_req, res, next) => {
  try {
    const [artists, producers] = await Promise.all([
      prisma.artist.findMany({
        orderBy: { created_at: 'desc' },
        include: {
          user: { select: { email: true } },
          passport: { select: { passport_code: true, profile_strength: true, profile_views: true } },
          bookings: { select: { status: true } },
          releases: { select: { id: true } },
        },
      }),
      prisma.producer.findMany({
        orderBy: { created_at: 'desc' },
        include: {
          user: { select: { email: true } },
          passport: { select: { passport_code: true, profile_strength: true, profile_views: true } },
          tracks: { where: { is_active: true }, select: { id: true } },
          projects: { select: { id: true } },
        },
      }),
    ]);
    const creators = [
      ...artists.map((artist) => ({
        id: artist.id, type: 'ARTIST', name: artist.name, alias: artist.alias, email: artist.user.email,
        avatar_url: artist.avatar_url, created_at: artist.created_at, status: artist.status,
        passport_code: artist.passport?.passport_code ?? null, profile_strength: artist.passport?.profile_strength ?? 0,
        profile_views: artist.passport?.profile_views ?? 0, output_count: artist.releases.length,
        engagement_count: artist.bookings.length, completed_count: artist.bookings.filter((b) => b.status === 'COMPLETED').length,
      })),
      ...producers.map((producer) => ({
        id: producer.id, type: 'PRODUCER', name: producer.name, alias: producer.alias, email: producer.user.email,
        avatar_url: producer.avatar_url, created_at: producer.created_at, status: producer.open_to_collabs ? 'OPEN_TO_COLLABS' : 'PRIVATE',
        passport_code: producer.passport?.passport_code ?? null, profile_strength: producer.passport?.profile_strength ?? 0,
        profile_views: producer.passport?.profile_views ?? 0, output_count: producer.tracks.length,
        engagement_count: producer.projects.length, completed_count: 0,
      })),
    ].sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    const ready = creators.filter((creator) => creator.profile_strength >= 70).length;
    const engaged = creators.filter((creator) => creator.engagement_count > 0).length;
    res.json({
      totals: { creators: creators.length, artists: artists.length, producers: producers.length, passport_ready: ready, engaged },
      average_profile_strength: creators.length ? Math.round(creators.reduce((sum, creator) => sum + creator.profile_strength, 0) / creators.length) : 0,
      creators,
    });
  } catch (error) { next(error); }
});

maintenanceRouter.get('/bookings', async (_req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { created_at: 'desc' }, take: 250,
      include: {
        studio: { select: { id: true, name: true } }, artist: { select: { id: true, name: true, alias: true } },
        room: { select: { name: true } }, service: { select: { name: true } }, engineer: { select: { name: true } },
        payment: { select: { status: true, amount_usd: true, provider: true } },
      },
    });
    const states = Object.fromEntries(['PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW'].map((status) => [status, bookings.filter((booking) => booking.status === status).length]));
    const paymentExceptions = bookings.filter((booking) => booking.payment?.status === 'FAILED').length;
    const paid = bookings.filter((booking) => booking.payment?.status === 'PAID');
    const paidVolume = paid.reduce((sum, booking) => sum + Number(booking.payment?.amount_usd ?? 0), 0);
    const actionable = bookings.filter((booking) => booking.status === 'PENDING' || booking.payment?.status === 'FAILED').length;
    res.json({
      totals: { bookings: bookings.length, paid: paid.length, paid_volume: paidVolume, payment_exceptions: paymentExceptions, actionable },
      states,
      completion_rate: bookings.length ? Math.round((states.COMPLETED / bookings.length) * 100) : 0,
      cancellation_rate: bookings.length ? Math.round(((states.CANCELLED + states.NO_SHOW) / bookings.length) * 100) : 0,
      bookings: bookings.map((booking) => ({
        id: booking.id, created_at: booking.created_at, starts_at: booking.starts_at, ends_at: booking.ends_at,
        status: booking.status, total_usd: Number(booking.total_usd), studio: booking.studio, artist: booking.artist,
        room: booking.room.name, service: booking.service.name, engineer: booking.engineer?.name ?? null,
        payment: booking.payment ? { ...booking.payment, amount_usd: Number(booking.payment.amount_usd) } : null,
      })),
    });
  } catch (error) { next(error); }
});

maintenanceRouter.get('/finance', async (_req, res, next) => {
  try {
    const [payments, bookingValue, wallets, topUps, walletDrift] = await Promise.all([
      prisma.payment.findMany({ orderBy: { created_at: 'desc' }, take: 200, include: { booking: { select: { id: true, studio: { select: { id: true, name: true } }, artist: { select: { name: true, alias: true } } } } } }),
      prisma.booking.aggregate({ where: { status: { notIn: ['CANCELLED', 'NO_SHOW'] } }, _sum: { total_usd: true } }),
      prisma.wallet.aggregate({ _sum: { balance_usd: true } }),
      prisma.walletTopUp.aggregate({ where: { status: 'PAID' }, _sum: { amount_usd: true } }),
      findWalletDrift(),
    ]);
    const paid = payments.filter((payment) => payment.status === 'PAID');
    const collected = paid.reduce((sum, payment) => sum + Number(payment.amount_usd), 0);
    const providers = Object.entries(paid.reduce<Record<string, { count:number; volume:number }>>((acc, payment) => {
      acc[payment.provider] ??= { count: 0, volume: 0 }; acc[payment.provider].count += 1; acc[payment.provider].volume += Number(payment.amount_usd); return acc;
    }, {})).map(([provider, values]) => ({ provider, ...values }));
    const studioMap = new Map<string, { id:string; name:string; payments:number; collected:number }>();
    for (const payment of paid) { const studio = payment.booking.studio; const row = studioMap.get(studio.id) ?? { id:studio.id, name:studio.name, payments:0, collected:0 }; row.payments += 1; row.collected += Number(payment.amount_usd); studioMap.set(studio.id,row); }
    res.json({
      totals: {
        booked_value: Number(bookingValue._sum.total_usd ?? 0),
        collected,
        wallet_liability: Number(wallets._sum.balance_usd ?? 0),
        wallet_topups: Number(topUps._sum.amount_usd ?? 0),
        failed: payments.filter(p => p.status === 'FAILED').length,
        refunded: payments.filter(p => p.status === 'REFUNDED').reduce((s, p) => s + Number(p.amount_usd), 0),
        processing: payments.filter(p => p.status === 'PROCESSING').length,
        wallet_drift_count: walletDrift.length,
      },
      providers,
      studios: [...studioMap.values()].sort((a, b) => b.collected - a.collected),
      payments: payments.map(p => ({ id: p.id, created_at: p.created_at, paid_at: p.paid_at, status: p.status, provider: p.provider, amount_usd: Number(p.amount_usd), studio: p.booking.studio.name, artist: p.booking.artist.alias ?? p.booking.artist.name, booking_id: p.booking.id })),
      wallet_reconciliation: walletDrift,
    });
  } catch (error) { next(error); }
});

maintenanceRouter.get('/health', async (_req, res, next) => {
  try {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const databaseLatencyMs = Date.now() - started;
    const [webhookProcessing, webhookFailed, webhookProcessed, users, admins] = await Promise.all([
      prisma.stripeWebhookEvent.count({ where: { status: 'PROCESSING' } }),
      prisma.stripeWebhookEvent.count({ where: { status: 'FAILED' } }),
      prisma.stripeWebhookEvent.count({ where: { status: 'PROCESSED' } }),
      prisma.user.count(), prisma.user.count({ where: { role: 'OIANO_ADMIN' } }),
    ]);
    const stripeEnabled = process.env.STRIPE_ENABLED === 'true';
    res.json({
      checked_at: new Date().toISOString(), uptime_seconds: Math.floor(process.uptime()),
      services: { api: { status: 'OPERATIONAL' }, database: { status: 'OPERATIONAL', latency_ms: databaseLatencyMs }, webhooks: { status: webhookFailed > 0 ? 'DEGRADED' : 'OPERATIONAL', processing: webhookProcessing, failed: webhookFailed, processed: webhookProcessed } },
      configuration: { database: Boolean(process.env.DATABASE_URL), jwt: Boolean(process.env.JWT_SECRET), frontend_origin: Boolean(process.env.FRONTEND_URL), stripe_enabled: stripeEnabled, stripe_secret: !stripeEnabled || Boolean(process.env.STRIPE_SECRET_KEY), stripe_webhook_secret: !stripeEnabled || Boolean(process.env.STRIPE_WEBHOOK_SECRET), object_storage: Boolean(process.env.R2_ACCOUNT_ID) },
      security: { helmet: true, cors_allowlist: true, auth_rate_limit: true, role_protected_maintenance: true, webhook_idempotency: true, administrative_audit_log: true, mfa: true },
      accounts: { users, oiano_admins: admins },
    });
  } catch (error) { next(error); }
});

maintenanceRouter.get('/growth', async (_req, res, next) => {
  try {
    const now = new Date(); const daysAgo=(days:number)=>new Date(now.getTime()-days*86_400_000);
    const artists=await prisma.artist.findMany({select:{id:true,created_at:true,passport:{select:{profile_strength:true}},bookings:{select:{status:true,payment:{select:{status:true}},created_at:true}}}});
    const total=artists.length, passportStarted=artists.filter(a=>(a.passport?.profile_strength??0)>0).length, passportReady=artists.filter(a=>(a.passport?.profile_strength??0)>=70).length;
    const booked=artists.filter(a=>a.bookings.length>0).length, paid=artists.filter(a=>a.bookings.some(b=>b.payment?.status==='PAID')).length, completed=artists.filter(a=>a.bookings.some(b=>b.status==='COMPLETED')).length, repeat=artists.filter(a=>a.bookings.filter(b=>!['CANCELLED','NO_SHOW'].includes(b.status)).length>1).length;
    const monthly=Array.from({length:6},(_,index)=>{const start=new Date(now.getFullYear(),now.getMonth()-(5-index),1);const end=new Date(now.getFullYear(),now.getMonth()-(4-index),1);return{month:start.toLocaleDateString('en-US',{month:'short'}),creators:artists.filter(a=>a.created_at>=start&&a.created_at<end).length,bookings:artists.flatMap(a=>a.bookings).filter(b=>b.created_at>=start&&b.created_at<end).length};});
    const pct=(value:number)=>total?Math.round(value/total*100):0;
    res.json({funnel:[{stage:'Artist accounts',count:total,rate:100},{stage:'Passport started',count:passportStarted,rate:pct(passportStarted)},{stage:'Passport ready',count:passportReady,rate:pct(passportReady)},{stage:'First booking',count:booked,rate:pct(booked)},{stage:'Paid booking',count:paid,rate:pct(paid)},{stage:'Session completed',count:completed,rate:pct(completed)},{stage:'Repeat creator',count:repeat,rate:pct(repeat)}],monthly,signals:{new_artists_30d:artists.filter(a=>a.created_at>=daysAgo(30)).length,new_artists_prior_30d:artists.filter(a=>a.created_at>=daysAgo(60)&&a.created_at<daysAgo(30)).length,visitor_tracking:false,acquisition_source:false}});
  } catch(error){next(error);}
});
