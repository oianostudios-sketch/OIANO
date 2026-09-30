import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { rateLimitKey } from './rateLimitKey';

const secret = 'rate-limit-key-test-secret';
const token = (sub: string, options: jwt.SignOptions = {}) => jwt.sign({ sub, role: 'ARTIST', ver: 0 }, secret, options);

test('a caller who can prove who they are is counted as themselves, not as their address', () => {
  const key = rateLimitKey({ authorization: `Bearer ${token('artist-1')}`, address: '203.0.113.7', secret });
  assert.equal(key, 'user:artist-1');
});

test('two people behind one address do not share a budget', () => {
  const venue = '203.0.113.7';
  const first = rateLimitKey({ authorization: `Bearer ${token('artist-1')}`, address: venue, secret });
  const second = rateLimitKey({ authorization: `Bearer ${token('artist-2')}`, address: venue, secret });
  assert.notEqual(first, second, 'a venue is not one caller');
});

test('an anonymous caller is counted by address', () => {
  assert.equal(rateLimitKey({ address: '203.0.113.7', secret }), 'ip:203.0.113.7');
  assert.equal(rateLimitKey({ authorization: 'Bearer', address: '203.0.113.7', secret }), 'ip:203.0.113.7');
  assert.equal(rateLimitKey({ authorization: 'Basic abc', address: '203.0.113.7', secret }), 'ip:203.0.113.7');
});

test('an invented subject buys no budget', () => {
  const forged = jwt.sign({ sub: 'whoever-i-like' }, 'another-secret');
  assert.equal(rateLimitKey({ authorization: `Bearer ${forged}`, address: '203.0.113.7', secret }), 'ip:203.0.113.7');
  assert.equal(rateLimitKey({ authorization: 'Bearer not.a.token', address: '203.0.113.7', secret }), 'ip:203.0.113.7');
});

test('an expired token is counted by address', () => {
  const expired = token('artist-1', { expiresIn: -60 });
  assert.equal(rateLimitKey({ authorization: `Bearer ${expired}`, address: '203.0.113.7', secret }), 'ip:203.0.113.7');
});

test('with no secret to check against, nothing is taken on trust', () => {
  assert.equal(rateLimitKey({ authorization: `Bearer ${token('artist-1')}`, address: '203.0.113.7' }), 'ip:203.0.113.7');
});
