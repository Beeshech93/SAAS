import { prisma } from '../src/lib/prisma';

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npx tsx scripts/promote-superadmin.ts <user-email>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User with email "${email}" not found.`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { isSuperAdmin: true },
  });

  console.log(`✓ User ${updated.name} (${updated.email}) is now a Super Admin!`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error promoting user:', err);
  process.exit(1);
});
