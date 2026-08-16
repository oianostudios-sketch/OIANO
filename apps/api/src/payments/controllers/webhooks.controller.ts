import { NextFunction, Request, Response } from 'express';
import { processGatewayWebhook } from '../services/webhook.service';

export async function paymentWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await processGatewayWebhook(req.params.provider, req.body, req.headers);
    res.status(200).json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    next(error);
  }
}
