import { messages, PASSWORD_MIN_LENGTH } from '@prime-crm/shared';
import { describe, expect, it } from 'vitest';

/**
 * A password field's placeholder is a hint, never a sample password: an admin who reads
 * "Welcome@2026" as a suggestion hands every new member the same guessable password.
 */
describe('password placeholders', () => {
  it.each(['en', 'ar'] as const)(
    'in %s describe the rule, not a password',
    (locale) => {
      const text = messages[locale].admin.users.passwordPlaceholder;
      // A sample password is one token mixing letters with digits or symbols; a hint has words.
      expect(text.trim()).toMatch(/\s/);
      expect(text).toContain(String(PASSWORD_MIN_LENGTH));
    },
  );
});
