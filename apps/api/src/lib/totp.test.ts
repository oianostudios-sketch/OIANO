import assert from 'node:assert/strict';
import test from 'node:test';
import { encryptTotp, newTotpSecret, tryDecryptTotp } from './totp';

test('pending MFA setup safely reuses a valid encrypted secret', () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = 'test-only-mfa-key-with-sufficient-entropy';
  try {
    const secret = newTotpSecret();
    assert.equal(tryDecryptTotp(encryptTotp(secret)), secret);
  } finally {
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousKey;
  }
});

test('a corrupted or legacy MFA secret fails closed without throwing', () => {
  const previousKey = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = 'test-only-mfa-key-with-sufficient-entropy';
  try {
    assert.equal(tryDecryptTotp('not-valid-ciphertext'), null);
  } finally {
    if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
    else process.env.MFA_ENCRYPTION_KEY = previousKey;
  }
});
