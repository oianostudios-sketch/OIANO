export type CurrencyCode = string;
export type GatewayPaymentStatus = 'REQUIRES_ACTION' | 'PROCESSING' | 'AUTHORIZED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface CreateGatewayPaymentInput {
  paymentId: string;
  reference: string;
  amountMinor: bigint;
  currency: CurrencyCode;
  country: string;
  idempotencyKey: string;
  returnUrl: string;
  metadata: Record<string, string>;
}

export interface GatewayPaymentResult {
  provider: string;
  providerPaymentId: string;
  status: GatewayPaymentStatus;
  checkoutUrl?: string;
}

export interface VerifiedGatewayEvent {
  provider: string;
  providerEventId: string;
  providerPaymentId: string;
  status: GatewayPaymentStatus;
  payloadHash: string;
}
export interface RefundGatewayPaymentInput { providerPaymentId:string; amountMinor:bigint; currency:string; idempotencyKey:string; reason:string }
export interface GatewayRefundResult { providerRefundId:string; status:'PROCESSING'|'SUCCEEDED'|'FAILED' }

export interface PaymentGateway {
  readonly name: string;
  createPayment(input: CreateGatewayPaymentInput): Promise<GatewayPaymentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<GatewayPaymentStatus>;
  refundPayment(input: RefundGatewayPaymentInput): Promise<GatewayRefundResult>;
  verifyWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>): Promise<VerifiedGatewayEvent>;
}
