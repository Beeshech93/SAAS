import { decrypt } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { getProvider } from './provider';

export interface DeliveryResult {
  delivery: 'sent' | 'failed' | 'not_configured';
  messageId?: string;
  error?: string;
}

type Integration = NonNullable<Awaited<ReturnType<typeof loadActiveIntegration>>>;
const credsOf = (i: Integration) => ({
  phoneNumberId: i.phoneNumberId,
  accessToken: decrypt(i.accessTokenEnc),
  provider: i.provider,
  baseUrl: i.baseUrl,
  instanceName: i.instanceName,
});

export async function loadActiveIntegration(businessId: string) {
  return prisma.whatsAppIntegration.findFirst({ where: { businessId, status: 'ACTIVE' } });
}

/** Sends a text through the business's own WhatsApp number. Never throws: failures are reported. */
export async function deliverText(businessId: string, to: string, text: string): Promise<DeliveryResult> {
  const integration = await loadActiveIntegration(businessId);
  if (!integration) return { delivery: 'not_configured' };
  try {
    const provider = getProvider(credsOf(integration));
    const { messageId } = await provider.sendTextMessage(to, text);
    return { delivery: 'sent', messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    logger.warn({ event: 'whatsapp_send_failed', businessId, error: message }, 'WhatsApp send failed');
    return { delivery: 'failed', error: message };
  }
}

export async function markInboundAsRead(businessId: string, messageId: string) {
  try {
    const integration = await loadActiveIntegration(businessId);
    if (!integration) return;
    await getProvider(credsOf(integration)).markAsRead(messageId);
  } catch (err) {
    logger.debug({ event: 'whatsapp_mark_read_failed', businessId, error: (err as Error).message }, 'markAsRead failed');
  }
}
