import { prisma } from '../../lib/prisma';

export async function reconcileLedgerTransaction(transactionId:string){
  const transaction=await prisma.ledgerTransaction.findUnique({where:{id:transactionId},include:{entries:true}});
  if(!transaction)return {reconciled:false,reason:'NOT_FOUND'};
  const debits=transaction.entries.filter(e=>e.direction==='DEBIT').reduce((n,e)=>n+e.amount_minor,0n);
  const credits=transaction.entries.filter(e=>e.direction==='CREDIT').reduce((n,e)=>n+e.amount_minor,0n);
  const currencies=new Set(transaction.entries.map(e=>e.currency));
  return {reconciled:debits===credits&&currencies.size===1&&currencies.has(transaction.currency),debits:debits.toString(),credits:credits.toString(),currency:transaction.currency};
}
