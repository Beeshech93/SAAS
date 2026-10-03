import { AppError } from '../../lib/errors';

/**
 * Seam for the future payment provider (card / mobile money). Nothing real is wired yet:
 * plan limits and entitlements are implemented first, as required. A concrete provider will
 * create checkout sessions, receive its own signed webhooks and update Subscription.status.
 */
export interface PaymentProvider {
  createCheckoutSession(input: { businessId: string; planCode: string; successUrl: string; cancelUrl: string }): Promise<{ url: string }>;
  cancelSubscription(externalSubscriptionId: string): Promise<void>;
}

export class NoopPaymentProvider implements PaymentProvider {
  async createCheckoutSession(): Promise<{ url: string }> {
    throw new AppError(501, 'NOT_IMPLEMENTED', 'Online payments are not configured yet');
  }
  async cancelSubscription(): Promise<void> {
    throw new AppError(501, 'NOT_IMPLEMENTED', 'Online payments are not configured yet');
  }
}

export const paymentProvider: PaymentProvider = new NoopPaymentProvider();
