import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { getPaymentGateway } from '../gateways/router';
import { postRefundLedger } from '../ledger/ledger.service';
import { assertRefundActor, calculateRefundOutcome } from '../domain/refundPolicy';

export async function refundPayment(input:{paymentId:string;amountMinor:bigint;reason:string;idempotencyKey:string;actorId:string;actorRole:string}){
  const payment=await prisma.oianoPayment.findUnique({where:{id:input.paymentId},include:{refunds:true}});if(!payment)throw new AppError('PAYMENT_NOT_FOUND',404);
  const staff=input.actorRole==='STUDIO_ADMIN'?await prisma.studioStaff.findUnique({where:{user_id:input.actorId}}):null;
  assertRefundActor({actorRole:input.actorRole,paymentStudioId:payment.studio_id,actorStudioId:staff?.studio_id});
  const existing=await prisma.oianoRefund.findUnique({where:{idempotency_key:input.idempotencyKey}});
  if(existing){if(existing.payment_id!==payment.id)throw new AppError('IDEMPOTENCY_KEY_REUSED',409);return {refund:existing,idempotent:true};}
  if(!['SUCCEEDED','PARTIALLY_REFUNDED'].includes(payment.status))throw new AppError('INVALID_PAYMENT_STATE',409);
  const refunded=payment.refunds.filter(r=>r.status==='SUCCEEDED').reduce((n,r)=>n+r.amount_minor,0n);
  const outcome=calculateRefundOutcome({paymentAmountMinor:payment.amount_minor,succeededRefundsMinor:refunded,requestedAmountMinor:input.amountMinor});
  if(!payment.provider_payment_id)throw new AppError('INVALID_PAYMENT_STATE',409);
  const gateway=getPaymentGateway(payment.provider);const reference=`ref_oiano_${crypto.randomBytes(7).toString('hex')}`;
  const result=await gateway.refundPayment({providerPaymentId:payment.provider_payment_id,amountMinor:input.amountMinor,currency:payment.transaction_currency,idempotencyKey:input.idempotencyKey,reason:input.reason});
  return prisma.$transaction(async tx=>{const refund=await tx.oianoRefund.create({data:{id:crypto.randomUUID(),reference,idempotency_key:input.idempotencyKey,payment_id:payment.id,amount_minor:input.amountMinor,currency:payment.transaction_currency,reason:input.reason,provider_refund_id:result.providerRefundId,status:result.status,completed_at:result.status==='SUCCEEDED'?new Date():null}});if(result.status==='SUCCEEDED'){await postRefundLedger(tx,payment,refund);await tx.oianoPayment.update({where:{id:payment.id},data:{status:outcome.paymentStatus,refunded_at:outcome.paymentStatus==='REFUNDED'?new Date():null}});}await tx.financialAuditEvent.create({data:{id:crypto.randomUUID(),actor_id:input.actorId,action:result.status==='SUCCEEDED'?'REFUND_COMPLETED':'REFUND_REQUESTED',entity_type:'REFUND',entity_id:refund.id,metadata:{payment_reference:payment.reference}}});return {refund,idempotent:false};});
}
