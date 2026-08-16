import { OianoPaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { assertPaymentTransition } from '../domain/stateMachine';
import { getPaymentGateway } from '../gateways/router';
import { postPaymentLedger } from '../ledger/ledger.service';
import crypto from 'crypto';

const canonicalStatuses = new Set<OianoPaymentStatus>([
  'REQUIRES_ACTION', 'PROCESSING', 'AUTHORIZED', 'SUCCEEDED', 'FAILED', 'CANCELLED',
]);

export async function processGatewayWebhook(
  provider: string,
  payload: unknown,
  headers: Record<string, string | string[] | undefined>,
) {
  const gateway = getPaymentGateway(provider);
  const event = await gateway.verifyWebhook(payload, headers);
  if (event.provider !== gateway.name || !canonicalStatuses.has(event.status as OianoPaymentStatus)) {
    throw new AppError('WEBHOOK_INVALID', 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.oianoPayment.findFirst({
        where: { provider: gateway.name, provider_payment_id: event.providerPaymentId },
      });
      if (!payment) throw new AppError('PAYMENT_NOT_FOUND', 404);

      await tx.paymentGatewayEvent.create({
        data: {
          provider: gateway.name,
          provider_event_id: event.providerEventId,
          event_type: `payment.${event.status.toLowerCase()}`,
          payment_id: payment.id,
          payload_hash: event.payloadHash,
          status: 'PROCESSING',
        },
      });

      const nextStatus = event.status as OianoPaymentStatus;
      assertPaymentTransition(payment.status, nextStatus);
      const now = new Date();
      if(nextStatus==='SUCCEEDED'&&payment.status!=='SUCCEEDED') await postPaymentLedger(tx,payment);
      const updated = await tx.oianoPayment.update({
        where: { id: payment.id },
        data: {
          status: nextStatus,
          authorized_at: nextStatus === 'AUTHORIZED' ? now : payment.authorized_at,
          paid_at: nextStatus === 'SUCCEEDED' ? now : payment.paid_at,
          failed_at: nextStatus === 'FAILED' ? now : payment.failed_at,
          cancelled_at: nextStatus === 'CANCELLED' ? now : payment.cancelled_at,
        },
      });
      await tx.paymentGatewayEvent.update({
        where: { provider_provider_event_id: { provider: gateway.name, provider_event_id: event.providerEventId } },
        data: { status: 'PROCESSED', processed_at: now },
      });
      await tx.financialAuditEvent.create({data:{id:crypto.randomUUID(),action:`PAYMENT_${nextStatus}`,entity_type:'PAYMENT',entity_id:payment.id,metadata:{provider:gateway.name,event_id:event.providerEventId}}});
      return { duplicate: false, payment: updated };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { duplicate: true, payment: null };
    }
    throw error;
  }
}
