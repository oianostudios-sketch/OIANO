import crypto from 'crypto';
import { PaymentPurpose, UniversalPaymentMethod } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { decimalToMinor, normalizeCurrency } from '../domain/money';
import { routePaymentGateway } from '../gateways/router';

export async function createBookingCheckout(input: { bookingId:string; userId:string; userRole:string; country:string; purpose:PaymentPurpose; method:UniversalPaymentMethod; idempotencyKey:string; returnUrl:string }) {
  const existing = await prisma.oianoPayment.findUnique({ where:{ idempotency_key:input.idempotencyKey } });
  if (existing) return { payment:existing, checkoutUrl:null, idempotent:true };
  const booking = await prisma.booking.findUnique({ where:{id:input.bookingId}, include:{studio:true,artist:true,service:true} });
  if (!booking) throw new AppError('PAYMENT_NOT_FOUND',404);
  if (input.userRole !== 'STUDIO_ADMIN' && (input.userRole !== 'ARTIST' || booking.artist.user_id !== input.userId)) throw new AppError('PAYMENT_NOT_FOUND',404);
  const currency = normalizeCurrency(booking.studio.currency);
  const amountMinor = decimalToMinor(booking.total_usd.toFixed(2), currency);
  const feeBps = BigInt(Number(process.env.PAYMENTS_PLATFORM_FEE_BPS ?? 1500));
  const platformFeeMinor = (amountMinor * feeBps + 9999n) / 10000n;
  const merchantNetMinor = amountMinor - platformFeeMinor;
  if (merchantNetMinor + platformFeeMinor !== amountMinor) throw new AppError('AMOUNT_MISMATCH',500);
  const reference = `pay_oiano_${crypto.randomBytes(7).toString('hex')}`;
  const gateway = routePaymentGateway({country:input.country,currency,method:input.method,merchantId:booking.studio_id});
  const payment = await prisma.oianoPayment.create({ data:{ reference,idempotency_key:input.idempotencyKey,payer_id:booking.artist.user_id,merchant_id:booking.studio_id,studio_id:booking.studio_id,booking_id:booking.id,project_id:booking.project_id,service_id:booking.service_id,amount_minor:amountMinor,pricing_currency:currency,transaction_currency:currency,ledger_currency:currency,settlement_currency:currency,country:input.country,purpose:input.purpose,payment_method:input.method,provider:gateway.name,platform_fee_minor:platformFeeMinor,merchant_net_minor:merchantNetMinor,metadata:{service_name:booking.service.name} } });
  await prisma.financialAuditEvent.create({data:{id:crypto.randomUUID(),actor_id:input.userId,action:'PAYMENT_CREATED',entity_type:'PAYMENT',entity_id:payment.id,metadata:{reference:payment.reference,currency}}});
  try {
    const result = await gateway.createPayment({paymentId:payment.id,reference,amountMinor,currency,country:input.country,idempotencyKey:input.idempotencyKey,returnUrl:input.returnUrl,metadata:{booking_id:booking.id}});
    const updated = await prisma.oianoPayment.update({where:{id:payment.id},data:{provider_payment_id:result.providerPaymentId,status:result.status}});
    return {payment:updated,checkoutUrl:result.checkoutUrl??null,idempotent:false};
  } catch (error) {
    await prisma.oianoPayment.update({where:{id:payment.id},data:{status:'FAILED',failed_at:new Date()}});
    throw new AppError('GATEWAY_UNAVAILABLE',503);
  }
}
