import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { buildCreatorContext } from '../lib/creatorContext';

// GET /api/context — one call answering where the caller is, what needs them,
// and what to do next. Always about the authenticated caller; it takes no
// parameters, so it cannot be pointed at somebody else's situation.
export const contextRouter = Router();
contextRouter.use(authenticate);

contextRouter.get('/', async (req: any, res, next) => {
  try {
    res.json(await buildCreatorContext(req.userId, req.userRole));
  } catch (error) { next(error); }
});
