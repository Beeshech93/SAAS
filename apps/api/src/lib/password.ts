import bcrypt from 'bcryptjs';

const ROUNDS = 12;
// Used to keep login timing similar when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', ROUNDS);

export const hashPassword = (plain: string) => bcrypt.hash(plain, ROUNDS);

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? DUMMY_HASH);
  return hash !== null && ok;
}
