/**
 * Email service — SendGrid transactional emails
 * Covers: booking receipt, session delivery notification, top-up confirmation
 * All functions are no-ops when SENDGRID_API_KEY is not set.
 */

const FROM      = process.env.SENDGRID_FROM_EMAIL ?? 'noreply@dreamzmusiclab.com';
const FROM_NAME = 'Dreamz Music Lab';

function getSendGrid() {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return null;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(key);
  return sgMail;
}

async function send(to: string, subject: string, html: string) {
  const sg = getSendGrid();
  if (!sg) {
    console.warn('[email] SENDGRID_API_KEY not set — skipping email to', to);
    return;
  }
  await sg.send({ to, from: { email: FROM, name: FROM_NAME }, subject, html });
}

// ── Receipt email — fired by Stripe webhook on checkout.session.completed ─────

export async function sendReceiptEmail(toEmail: string, booking: any) {
  const startsAt    = new Date(booking.starts_at);
  const endsAt      = new Date(booking.ends_at);
  const durationHrs = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  const total       = Number(booking.total_usd ?? 0).toFixed(2);
  const receiptNum  = (booking.id ?? '').slice(0, 8).toUpperCase();
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0a0a0a;padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                <p style="font-family:Georgia,serif;font-size:26px;color:#C9A84C;margin:0;letter-spacing:3px;">OIANO</p>
                <p style="color:#666;font-size:11px;margin:4px 0 0;letter-spacing:1px;text-transform:uppercase;">Dreamz Music Lab · Studio Receipt</p>
              </td>
              <td align="right" style="vertical-align:top;">
                <p style="color:#888;font-size:11px;margin:0;font-family:monospace;">Receipt #${receiptNum}</p>
                <p style="color:#666;font-size:11px;margin:4px 0 0;font-family:monospace;">${new Date().toLocaleDateString('en-US')}</p>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="height:3px;background:linear-gradient(90deg,#C9A84C,#E2C97E,#C9A84C);"></td></tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px;">Billed to</p>
            <p style="font-size:18px;font-weight:600;color:#111;margin:0 0 24px;">${booking.artist?.name ?? 'Artist'}</p>

            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #f0f0f0;">
              <tr>
                <td style="padding:16px 0;vertical-align:top;width:75%;">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#111;">${booking.service?.name ?? 'Studio Session'}</p>
                  <p style="margin:4px 0 0;font-size:12px;color:#777;">${fmtDate(startsAt)}</p>
                  <p style="margin:2px 0 0;font-size:12px;color:#999;font-family:monospace;">${fmtTime(startsAt)} → ${fmtTime(endsAt)} (${durationHrs.toFixed(1)}h)</p>
                  ${booking.room ? `<p style="margin:2px 0 0;font-size:12px;color:#999;">Room: ${booking.room.name}</p>` : ''}
                  ${booking.engineer ? `<p style="margin:2px 0 0;font-size:12px;color:#999;">Engineer: ${booking.engineer.name}</p>` : ''}
                </td>
                <td style="padding:16px 0;text-align:right;vertical-align:top;">
                  <p style="margin:0;font-size:16px;font-weight:600;color:#111;">$${total}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
              <tr>
                <td style="font-size:13px;color:#555;padding-top:12px;">Total</td>
                <td align="right" style="font-size:22px;font-weight:700;color:#111;font-family:Georgia,serif;padding-top:12px;">$${total}</td>
              </tr>
              <tr>
                <td></td>
                <td align="right" style="padding-top:8px;">
                  <span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:#d1fae5;color:#065f46;font-family:monospace;">PAID</span>
                </td>
              </tr>
            </table>

            ${booking.notes ? `
            <div style="background:#fafafa;border:1px solid #eee;border-radius:8px;padding:16px 20px;margin-top:24px;">
              <p style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">Notes</p>
              <p style="font-size:13px;color:#555;margin:0;line-height:1.6;">${booking.notes}</p>
            </div>` : ''}

            <div style="margin-top:32px;text-align:center;">
              <a href="${frontendUrl}/bookings/${booking.id}"
                 style="display:inline-block;background:#C9A84C;color:#000;font-weight:600;font-size:13px;padding:12px 28px;border-radius:8px;text-decoration:none;">
                View Booking →
              </a>
            </div>

            <div style="margin-top:36px;padding-top:20px;border-top:1px solid #f0f0f0;">
              <p style="font-size:12px;color:#C9A84C;font-family:Georgia,serif;margin:0;">Dreamz Music Lab</p>
              <p style="font-size:10px;color:#ccc;margin:4px 0 0;font-family:monospace;">Powered by OIANO StudioOS</p>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await send(toEmail, `Receipt #${receiptNum} — Dreamz Music Lab`, html);
}

// ── Session file delivery email ───────────────────────────────────────────────

export async function sendDeliveryEmail(
  toEmail: string,
  artistName: string,
  bookingId: string,
  fileUrls: string[],
) {
  const receiptNum  = bookingId.slice(0, 8).toUpperCase();
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const fileList    = fileUrls
    .map((url, i) => `<li style="margin:6px 0;"><a href="${url}" style="color:#C9A84C;font-family:monospace;font-size:12px;">${url.split('/').pop() ?? `File ${i + 1}`}</a></li>`)
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:40px;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#0a0a0a;padding:28px 36px;">
      <p style="font-family:Georgia,serif;font-size:24px;color:#C9A84C;margin:0;letter-spacing:3px;">OIANO</p>
      <p style="color:#666;font-size:11px;margin:4px 0 0;letter-spacing:1px;text-transform:uppercase;">Dreamz Music Lab · Your Files Are Ready</p>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#C9A84C,#E2C97E,#C9A84C);"></div>
    <div style="padding:36px;">
      <p style="font-size:18px;font-weight:600;color:#111;margin:0 0 8px;">Your session files are ready, ${artistName}.</p>
      <p style="font-size:14px;color:#555;margin:0 0 24px;">Session <strong>#${receiptNum}</strong> — your engineer has delivered the following files:</p>
      <ul style="padding-left:18px;margin:0 0 28px;">${fileList}</ul>
      <a href="${frontendUrl}/bookings/${bookingId}"
         style="display:inline-block;background:#C9A84C;color:#000;font-weight:600;font-size:13px;padding:12px 28px;border-radius:8px;text-decoration:none;">
        View & Download →
      </a>
      <p style="margin-top:32px;font-size:11px;color:#bbb;font-family:monospace;">Dreamz Music Lab · Powered by OIANO StudioOS</p>
    </div>
  </div>
</body>
</html>`;

  await send(toEmail, `Your session files are ready — #${receiptNum}`, html);
}

// ── Wallet top-up confirmation email ─────────────────────────────────────────

export async function sendTopUpEmail(toEmail: string, amount: number, newBalance: number) {
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:40px;background:#f4f4f4;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#0a0a0a;padding:28px 36px;">
      <p style="font-family:Georgia,serif;font-size:24px;color:#C9A84C;margin:0;letter-spacing:3px;">OIANO</p>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#C9A84C,#E2C97E,#C9A84C);"></div>
    <div style="padding:36px;text-align:center;">
      <p style="font-size:48px;font-weight:700;color:#111;margin:0;font-family:Georgia,serif;">$${amount.toFixed(2)}</p>
      <p style="font-size:14px;color:#555;margin:8px 0 4px;">added to your studio wallet</p>
      <p style="font-size:12px;color:#999;margin:0 0 28px;">New balance: <strong style="color:#111;">$${newBalance.toFixed(2)}</strong></p>
      <a href="${frontendUrl}/book"
         style="display:inline-block;background:#C9A84C;color:#000;font-weight:600;font-size:13px;padding:12px 28px;border-radius:8px;text-decoration:none;">
        Book a session →
      </a>
      <p style="margin-top:28px;font-size:11px;color:#ccc;font-family:monospace;">Dreamz Music Lab · Powered by OIANO StudioOS</p>
    </div>
  </div>
</body>
</html>`;

  await send(toEmail, `$${amount.toFixed(2)} added to your Dreamz Music Lab wallet`, html);
}
// ── Booking status emails (used by bookings.controller.ts) ───────────────────

interface BookingEmailArgs {
  to: string;
  artistName: string;
  service: string;
  room?: string;
  startsAt: string;
  endsAt?: string;
  bookingId: string;
  totalUsd?: number;
}

export async function sendBookingConfirmed(args: BookingEmailArgs) {
  const { to, artistName, service, room, startsAt, endsAt, bookingId, totalUsd } = args;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const start = new Date(startsAt);
  const end   = endsAt ? new Date(endsAt) : null;
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
  <div style="background:#0a0a0a;padding:24px 32px;">
    <p style="font-family:Georgia,serif;font-size:22px;color:#C9A84C;margin:0;letter-spacing:2px;">OIANO</p>
    <p style="color:#666;font-size:10px;margin:4px 0 0;text-transform:uppercase;letter-spacing:1px;">Dreamz Music Lab</p>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#C9A84C,#E2C97E,#C9A84C);"></div>
  <div style="padding:28px 32px;">
    <p style="font-size:16px;font-weight:600;color:#111;margin:0 0 6px;">Session confirmed, ${artistName}.</p>
    <p style="font-size:13px;color:#555;margin:0 0 20px;">${service}${room ? ` · ${room}` : ''}</p>
    <p style="font-size:13px;color:#333;margin:0;">${fmtDate(start)} · ${fmtTime(start)}${end ? ` – ${fmtTime(end)}` : ''}</p>
    ${totalUsd ? `<p style="font-size:13px;color:#999;margin:4px 0 0;">Total: <strong>$${totalUsd.toFixed(2)}</strong></p>` : ''}
    <div style="margin-top:24px;">
      <a href="${frontendUrl}/bookings/${bookingId}" style="background:#C9A84C;color:#000;font-weight:600;font-size:12px;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">View Booking →</a>
    </div>
    <p style="margin-top:24px;font-size:10px;color:#bbb;font-family:monospace;">Dreamz Music Lab · Powered by OIANO StudioOS</p>
  </div>
</div>`;

  await send(to, `Session confirmed — ${fmtDate(start)}`, html);
}

export async function sendSessionComplete(args: BookingEmailArgs) {
  const { to, artistName, service, startsAt, bookingId } = args;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
  const start = new Date(startsAt);
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
  <div style="background:#0a0a0a;padding:24px 32px;">
    <p style="font-family:Georgia,serif;font-size:22px;color:#C9A84C;margin:0;letter-spacing:2px;">OIANO</p>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#C9A84C,#E2C97E,#C9A84C);"></div>
  <div style="padding:28px 32px;">
    <p style="font-size:16px;font-weight:600;color:#111;margin:0 0 6px;">Session complete, ${artistName}.</p>
    <p style="font-size:13px;color:#555;margin:0 0 20px;">${service} · ${fmtDate(start)}</p>
    <p style="font-size:13px;color:#555;margin:0 0 20px;">Your session log and any delivered files are on your booking page.</p>
    <a href="${frontendUrl}/bookings/${bookingId}" style="background:#C9A84C;color:#000;font-weight:600;font-size:12px;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">View Session →</a>
    <p style="margin-top:24px;font-size:10px;color:#bbb;font-family:monospace;">Dreamz Music Lab · Powered by OIANO StudioOS</p>
  </div>
</div>`;

  await send(to, `Session complete — ${service}`, html);
}

export async function sendBookingCancelled(args: BookingEmailArgs) {
  const { to, artistName, service, startsAt } = args;
  const start = new Date(startsAt);
  const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;">
  <div style="background:#0a0a0a;padding:24px 32px;">
    <p style="font-family:Georgia,serif;font-size:22px;color:#C9A84C;margin:0;letter-spacing:2px;">OIANO</p>
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#C9A84C,#E2C97E,#C9A84C);"></div>
  <div style="padding:28px 32px;">
    <p style="font-size:16px;font-weight:600;color:#111;margin:0 0 6px;">Booking cancelled, ${artistName}.</p>
    <p style="font-size:13px;color:#555;margin:0 0 20px;">${service} · ${fmtDate(start)} has been cancelled.</p>
    <p style="font-size:13px;color:#555;margin:0 0 20px;">Contact the studio if you have questions, or book a new session below.</p>
    <a href="${frontendUrl}/book" style="background:#C9A84C;color:#000;font-weight:600;font-size:12px;padding:10px 22px;border-radius:6px;text-decoration:none;display:inline-block;">Book another session →</a>
    <p style="margin-top:24px;font-size:10px;color:#bbb;font-family:monospace;">Dreamz Music Lab · Powered by OIANO StudioOS</p>
  </div>
</div>`;

  await send(to, `Booking cancelled — ${service} on ${fmtDate(start)}`, html);
}
