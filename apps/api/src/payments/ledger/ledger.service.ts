import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';

type Tx = Prisma.TransactionClient;
type Posting = { ownerType:string; ownerId:string; accountType:string; direction:'DEBIT'|'CREDIT'; amountMinor:bigint };

export async function postBalancedTransaction(tx:Tx,input:{reference:string;paymentId?:string;refundId?:string;eventType:string;currency:string;postings:Posting[]}) {
  const debits=input.postings.filter(p=>p.direction==='DEBIT').reduce((n,p)=>n+p.amountMinor,0n);
  const credits=input.postings.filter(p=>p.direction==='CREDIT').reduce((n,p)=>n+p.amountMinor,0n);
  if(debits!==credits||debits<=0n) throw new AppError('LEDGER_OUT_OF_BALANCE',500);
  const transaction=await tx.ledgerTransaction.create({data:{reference:input.reference,payment_id:input.paymentId,refund_id:input.refundId,event_type:input.eventType,currency:input.currency}});
  for(const posting of input.postings){
    const account=await tx.financialAccount.upsert({
      where:{owner_type_owner_id_currency_account_type:{owner_type:posting.ownerType,owner_id:posting.ownerId,currency:input.currency,account_type:posting.accountType}},
      create:{id:crypto.randomUUID(),owner_type:posting.ownerType,owner_id:posting.ownerId,currency:input.currency,account_type:posting.accountType},update:{},
    });
    await tx.ledgerEntry.create({data:{id:crypto.randomUUID(),transaction_id:transaction.id,account_id:account.id,direction:posting.direction,amount_minor:posting.amountMinor,currency:input.currency}});
  }
  return transaction;
}

export async function postPaymentLedger(tx:Tx,payment:{id:string;reference:string;merchant_id:string;amount_minor:bigint;platform_fee_minor:bigint;merchant_net_minor:bigint;ledger_currency:string}){
  if(payment.platform_fee_minor+payment.merchant_net_minor!==payment.amount_minor)throw new AppError('AMOUNT_MISMATCH',500);
  await tx.paymentAllocation.createMany({data:[
    {id:crypto.randomUUID(),payment_id:payment.id,beneficiary_type:'STUDIO',beneficiary_id:payment.merchant_id,amount_minor:payment.merchant_net_minor,currency:payment.ledger_currency,allocation_type:'MERCHANT_NET'},
    {id:crypto.randomUUID(),payment_id:payment.id,beneficiary_type:'PLATFORM',beneficiary_id:'OIANO',amount_minor:payment.platform_fee_minor,currency:payment.ledger_currency,allocation_type:'PLATFORM_FEE'},
  ]});
  return postBalancedTransaction(tx,{reference:`ledger_${payment.reference}`,paymentId:payment.id,eventType:'PAYMENT_SUCCEEDED',currency:payment.ledger_currency,postings:[
    {ownerType:'GATEWAY',ownerId:'CLEARING',accountType:'RECEIVABLE',direction:'DEBIT',amountMinor:payment.amount_minor},
    {ownerType:'STUDIO',ownerId:payment.merchant_id,accountType:'PENDING',direction:'CREDIT',amountMinor:payment.merchant_net_minor},
    {ownerType:'PLATFORM',ownerId:'OIANO',accountType:'FEES',direction:'CREDIT',amountMinor:payment.platform_fee_minor},
  ]});
}

export async function postRefundLedger(tx:Tx,payment:{id:string;merchant_id:string;amount_minor:bigint;platform_fee_minor:bigint;merchant_net_minor:bigint;ledger_currency:string},refund:{id:string;reference:string;amount_minor:bigint}){
  const feeReversal=(payment.platform_fee_minor*refund.amount_minor)/payment.amount_minor;
  const merchantReversal=refund.amount_minor-feeReversal;
  return postBalancedTransaction(tx,{reference:`ledger_${refund.reference}`,paymentId:payment.id,refundId:refund.id,eventType:'REFUND_COMPLETED',currency:payment.ledger_currency,postings:[
    {ownerType:'STUDIO',ownerId:payment.merchant_id,accountType:'PENDING',direction:'DEBIT',amountMinor:merchantReversal},
    ...(feeReversal>0n?[{ownerType:'PLATFORM',ownerId:'OIANO',accountType:'FEES',direction:'DEBIT' as const,amountMinor:feeReversal}]:[]),
    {ownerType:'GATEWAY',ownerId:'CLEARING',accountType:'RECEIVABLE',direction:'CREDIT',amountMinor:refund.amount_minor},
  ]});
}
