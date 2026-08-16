import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

export const feedbackRouter = Router();
feedbackRouter.use(authenticate);

const FeedbackBody = z.object({
  category: z.enum(['BUG', 'CONFUSING', 'FEATURE_REQUEST', 'MISSING_INFO', 'OTHER']),
  page: z.string().min(1).max(500),
  description: z.string().min(1).max(4000),
});

// POST /api/feedback — any authenticated user, any role
feedbackRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = FeedbackBody.parse(req.body);
    const userId = (req as any).userId as string;

    const feedback = await prisma.feedback.create({
      data: { user_id: userId, category: data.category, page: data.page, description: data.description },
    });

    res.status(201).json(feedback);
  } catch (err) { next(err); }
});

// GET /api/feedback — studio/network admins only, so reports don't vanish into a black hole
feedbackRouter.get('/', requireRole('STUDIO_ADMIN', 'OIANO_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const take = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'))));
    const feedback = await prisma.feedback.findMany({
      orderBy: { created_at: 'desc' },
      take,
      include: { user: { select: { email: true, role: true } } },
    });
    res.json(feedback);
  } catch (err) { next(err); }
});

// PATCH /api/feedback/:id — admins mark reports reviewed/resolved
const StatusBody = z.object({ status: z.enum(['OPEN', 'REVIEWED', 'RESOLVED']) });
feedbackRouter.patch('/:id', requireRole('STUDIO_ADMIN', 'OIANO_ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = StatusBody.parse(req.body);
    const feedback = await prisma.feedback.update({ where: { id: req.params.id }, data: { status } });
    res.json(feedback);
  } catch (err) { next(err); }
});
