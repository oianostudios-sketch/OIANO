// apps/api/src/routes/studio.routes.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared';

export const studioRouter = Router();

// GET /api/studio
studioRouter.get('/', async (_req, res, next) => {
  try {
    const studio = await prisma.studio.findUnique({
      where: { slug: DEFAULT_STUDIO_SLUG },
      include: { rooms: true, engineers: true, services: true },
    });
    res.json(studio);
  } catch (err) {
    next(err);
  }
});
