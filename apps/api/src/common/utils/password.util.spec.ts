import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('verifies the password it hashed and rejects another', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
    await expect(verifyPassword('correct hors', hash)).resolves.toBe(false);
  });

  it('salts: the same password hashes differently twice', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('handles Arabic passwords', async () => {
    const hash = await hashPassword('كلمة-سر-٢٠٢٦');
    await expect(verifyPassword('كلمة-سر-٢٠٢٦', hash)).resolves.toBe(true);
  });

  it('answers false for a malformed stored hash instead of throwing', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
    await expect(verifyPassword('x', 'bcrypt$1$2$3$a$b')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$0$8$1$a$b')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$16384$8$1$a$')).resolves.toBe(
      false,
    );
  });
});
