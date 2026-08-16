import { AppError } from '../../lib/errors';
import { PaymentGateway } from '../domain/types';
import { MockPaymentGateway } from './mock.gateway';
const gateways: Record<string, PaymentGateway> = { mock:new MockPaymentGateway() };
export function getPaymentGateway(provider: string) {
  const gateway = gateways[provider.toLowerCase()];
  if (!gateway) throw new AppError('GATEWAY_UNAVAILABLE', 503);
  return gateway;
}
export function routePaymentGateway(_input: { country:string; currency:string; method:string; merchantId:string }) {
  const configured = process.env.PAYMENTS_PROVIDER ?? 'mock';
  return getPaymentGateway(configured);
}
