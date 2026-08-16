import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { issueNotificationStreamTicket, verifyNotificationStreamTicket } from './notificationStreamTicket';

test('notification ticket is scoped to its user and stream purpose', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'notification-ticket-test-secret';
  try {
    const ticket = issueNotificationStreamTicket('user-1');
    assert.equal(verifyNotificationStreamTicket(ticket), 'user-1');
    const payload = jwt.decode(ticket) as jwt.JwtPayload;
    assert.equal(payload.purpose, 'notification-stream');
    assert.ok((payload.exp ?? 0) - (payload.iat ?? 0) <= 60);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});

test('ordinary access tokens cannot open notification streams', () => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'notification-ticket-test-secret';
  try {
    const accessToken = jwt.sign({ sub: 'user-1', role: 'ARTIST' }, process.env.JWT_SECRET, { expiresIn: '1h' });
    assert.throws(() => verifyNotificationStreamTicket(accessToken), (error: any) => error?.statusCode === 401);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
