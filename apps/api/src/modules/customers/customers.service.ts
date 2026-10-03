import { Prisma } from '@prisma/client';
import { conflict } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

export async function createCustomer(
  businessId: string,
  data: { phone: string; name?: string | null; email?: string | null; country?: string | null; notes?: string | null },
) {
  if (await prisma.customer.findFirst({ where: { businessId, phone: data.phone } })) {
    throw conflict('A customer with this phone number already exists');
  }
  try {
    return await prisma.customer.create({ data: { ...data, businessId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw conflict('A customer with this phone number already exists');
    }
    throw err;
  }
}

/** Used by the WhatsApp webhook (next phase): finds or creates the customer for a number. */
export async function findOrCreateCustomerByPhone(businessId: string, phone: string, name?: string | null) {
  const existing = await prisma.customer.findFirst({ where: { businessId, phone } });
  if (existing) return existing;
  return createCustomer(businessId, { phone, name: name ?? null });
}
