import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { accessLog } from '../middleware/accessLog.middleware';
import { errorHandler } from '../middleware/error.middleware';
import { AppError } from './errors';
import { redactUrlForLog } from './logRedaction';
import { issueNotificationStreamTicket } from './notificationStreamTicket';

// A real ticket, so each test fails on the credential itself rather than on a
// placeholder that a redaction rule might happen to catch.
function streamTicket() {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'log-redaction-test-secret';
  try {
    return issueNotificationStreamTicket('user-1');
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
}

function streamRequest(ticket: string) {
  return {
    method: 'GET',
    originalUrl: `/api/notifications/stream?ticket=${encodeURIComponent(ticket)}`,
    requestId: 'request-1',
  } as unknown as Request;
}

const next: NextFunction = () => {};

test('no query value reaches a log line, whatever its parameter is called', () => {
  const ticket = streamTicket();
  assert.equal(redactUrlForLog(`/api/notifications/stream?ticket=${ticket}`), '/api/notifications/stream?ticket=[redacted]');
  assert.equal(
    redactUrlForLog('/api/artists/a-1/files/f-1/content?download=1&ticket=abc'),
    '/api/artists/a-1/files/f-1/content?download=[redacted]&ticket=[redacted]',
  );
  // A ticket sent without a parameter name, or in its place, is still a ticket.
  assert.equal(redactUrlForLog(`/api/notifications/stream?${ticket}`), '/api/notifications/stream?[redacted]');
  assert.equal(redactUrlForLog(`/api/notifications/stream?${ticket}=1`), '/api/notifications/stream?[redacted]');
});

test('a URL with nothing to hide is logged as it was requested', () => {
  assert.equal(redactUrlForLog('/api/bookings/b-1'), '/api/bookings/b-1');
  assert.equal(redactUrlForLog('/api/bookings?'), '/api/bookings?');
  assert.equal(redactUrlForLog('/api/notifications/stream?ticket='), '/api/notifications/stream?ticket=');
});

test('the access log records a ticketed stream without its ticket', (t) => {
  // accessLog is silent under NODE_ENV=test.
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });
  const lines: string[] = [];
  t.mock.method(console, 'log', (line: string) => { lines.push(line); });

  const ticket = streamTicket();
  const res = Object.assign(new EventEmitter(), { statusCode: 200 }) as unknown as Response;
  accessLog(streamRequest(ticket), res, next);
  res.emit('finish');

  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).path, '/api/notifications/stream?ticket=[redacted]');
  assert.ok(!lines[0].includes(ticket));
});

test('the error log records a rejected stream ticket without the ticket', (t) => {
  const lines: string[] = [];
  t.mock.method(console, 'error', (line: string) => { lines.push(line); });

  const ticket = streamTicket();
  const sent: { status?: number } = {};
  const res = {
    status(code: number) { sent.status = code; return this; },
    json() { return this; },
  } as unknown as Response;
  errorHandler(new AppError('Invalid stream ticket', 401), streamRequest(ticket), res, next);

  assert.equal(sent.status, 401);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).path, '/api/notifications/stream?ticket=[redacted]');
  assert.ok(!lines[0].includes(ticket));
});
