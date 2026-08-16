import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { checkout, getPayment, listPayments, refund } from './controllers/payments.controller';
import { paymentWebhook } from './controllers/webhooks.controller';
export const universalPaymentsRouter=Router();
// Provider callbacks are signature-authenticated, never session-authenticated.
universalPaymentsRouter.post('/webhooks/:provider',rateLimit({max:120,windowMs:60_000}),paymentWebhook);
universalPaymentsRouter.use(authenticate);
universalPaymentsRouter.post('/checkout',rateLimit({max:20,windowMs:60_000}),checkout);
universalPaymentsRouter.get('/',listPayments);
universalPaymentsRouter.post('/:id/refund',rateLimit({max:10,windowMs:60_000}),refund);
universalPaymentsRouter.get('/:id',getPayment);
