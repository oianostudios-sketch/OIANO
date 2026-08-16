// apps/api/src/routes/notifications.routes.ts
// Server-Sent Events for real-time booking status updates
import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { authenticate } from '../middleware/auth.middleware';
import { issueNotificationStreamTicket, verifyNotificationStreamTicket } from '../lib/notificationStreamTicket';

export const notificationsRouter = Router();

// In-memory registry: userId -> Set<Response>
const clients = new Map<string, Set<Response>>();

/** Broadcast a JSON event to all open SSE connections for a user */
export function broadcastToUser(userId: string, event: Record<string, unknown>) {
  const conns = clients.get(userId);
  if (!conns || conns.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of [...conns]) {
    try {
      res.write(payload);
    } catch {
      conns.delete(res);
    }
  }
}

/** Broadcast to ALL connected clients (e.g. admin sees live updates too) */
export function broadcastAll(event: Record<string, unknown>) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const conns of clients.values()) {
    for (const res of [...conns]) {
      try {
        res.write(payload);
      } catch {
        conns.delete(res);
      }
    }
  }
}

// Exchange the normal Authorization header for a short-lived, purpose-bound
// ticket. EventSource cannot send custom headers, so only this limited ticket
// appears in the stream URL rather than the user's long-lived access token.
notificationsRouter.post('/stream-ticket', authenticate, (req: any, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ticket: issueNotificationStreamTicket(req.userId), expiresInSeconds: 60 });
});

// GET /api/notifications/stream?ticket=<short-lived-ticket>
notificationsRouter.get('/stream', (req: Request, res: Response) => {
  const ticket = req.query.ticket as string | undefined;
  if (!ticket) {
    res.status(401).json({ error: 'Missing stream ticket' });
    return;
  }

  let userId: string;
  try {
    userId = verifyNotificationStreamTicket(ticket);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // SSE headers — disable Helmet's noSniff for this route via the content-type
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx passthrough
  res.flushHeaders();

  // Heartbeat every 25s to prevent proxy timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  // Register
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(res);

  // Immediate connected event
  res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

  req.on('close', () => {
    clearInterval(heartbeat);
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  });
});

import { prisma } from '../lib/prisma';

// ── GET /api/notifications — last 40 notifications for the caller ─────────────
notificationsRouter.get('/', authenticate, async (req: any, res, next) => {
  try {
    const notifs = await prisma.notification.findMany({
      where:   { user_id: req.userId },
      orderBy: { created_at: 'desc' },
      take:    40,
    });
    res.json(notifs);
  } catch (err) { next(err); }
});

// ── PATCH /api/notifications/read — mark all as read ─────────────────────────
notificationsRouter.patch('/read', authenticate, async (req: any, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { user_id: req.userId, read_at: null },
      data:  { read_at: new Date() },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

notificationsRouter.patch('/:id/read', authenticate, async (req:any,res,next)=>{
  try{
    const result=await prisma.notification.updateMany({where:{id:req.params.id,user_id:req.userId},data:{read_at:new Date()}});
    if(!result.count)return res.status(404).json({error:'NOTIFICATION_NOT_FOUND'});
    res.json({success:true});
  }catch(err){next(err)}
});

notificationsRouter.delete('/:id', authenticate, async (req:any,res,next)=>{
  try{
    const result=await prisma.notification.deleteMany({where:{id:req.params.id,user_id:req.userId}});
    if(!result.count)return res.status(404).json({error:'NOTIFICATION_NOT_FOUND'});
    res.json({success:true});
  }catch(err){next(err)}
});

// ── helper: persist + broadcast ───────────────────────────────────────────────
export async function createNotification(params: {
  user_id: string;
  type:    string;
  title:   string;
  body:    string;
  payload?: Record<string, unknown>;
  priority?: 'LOW'|'NORMAL'|'HIGH'|'CRITICAL';
  action_url?: string;
  category?: 'BOOKING'|'PAYMENT'|'PROJECT'|'MESSAGE'|'SYSTEM'|'NETWORK';
}) {
  const notif = await prisma.notification.create({
    data: {
      user_id: params.user_id,
      type:    params.type,
      title:   params.title,
      body:    params.body,
      payload: ({ ...(params.payload ?? {}), priority:params.priority??'NORMAL', action_url:params.action_url, category:params.category??'SYSTEM' }) as Prisma.InputJsonValue,
    },
  });
  // Also push over SSE so the bell badge updates live
  broadcastToUser(params.user_id, {
    type:   'notification',
    notif,
  });
  return notif;
}
