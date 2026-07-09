import { Router, Request, Response, NextFunction } from 'express';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { AppError } from '../lib/errors';
import { DEFAULT_STUDIO_SLUG } from '@oiano/shared/constants';
import { fmtTime, fmtDateLong } from '../lib/fmt';

export const cardRouter = Router();

cardRouter.get('/:id/card.png', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, studio: { slug: DEFAULT_STUDIO_SLUG } },
      include: {
        artist:   { select: { name: true, alias: true } },
        room:     { select: { name: true } },
        engineer: { select: { name: true } },
        service:  { select: { name: true } },
        studio:   { select: { name: true, timezone: true } },
      },
    });
    if (!booking) throw new AppError('Booking not found', 404);

    const tz = booking.studio.timezone ?? 'America/New_York';
    const bookingUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/bookings/${booking.id}`;

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(bookingUrl, {
      width: 80,
      margin: 1,
      color: { dark: '#C9A84C', light: '#0a0a0a' },
    });

    // SVG element tree for satori
    const element = {
      type: 'div',
      props: {
        style: {
          width: '600px',
          height: '300px',
          background: '#0a0a0a',
          border: '1px solid #1e1e1e',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          padding: '32px',
          fontFamily: 'sans-serif',
          position: 'relative',
        },
        children: [
          // Top row: brand + status
          {
            type: 'div',
            props: {
              style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', gap: '4px' },
                    children: [
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#C9A84C', fontWeight: 700 },
                          children: 'OIANO',
                        },
                      },
                      {
                        type: 'span',
                        props: {
                          style: { fontSize: '10px', color: '#333', letterSpacing: '0.1em', textTransform: 'uppercase' },
                          children: booking.studio.name,
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'span',
                  props: {
                    style: {
                      fontSize: '9px',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: booking.status === 'CONFIRMED' ? '#4ade80' : '#C9A84C',
                      background: booking.status === 'CONFIRMED' ? '#052e16' : '#1a1200',
                      border: `1px solid ${booking.status === 'CONFIRMED' ? '#166534' : '#C9A84C44'}`,
                      padding: '3px 10px',
                      borderRadius: '20px',
                    },
                    children: booking.status,
                  },
                },
              ],
            },
          },
          // Artist name (large)
          {
            type: 'div',
            props: {
              style: { fontSize: '28px', fontWeight: 700, color: '#f0ede8', letterSpacing: '-0.02em', marginBottom: '4px' },
              children: booking.artist.name,
            },
          },
          booking.artist.alias ? {
            type: 'div',
            props: {
              style: { fontSize: '13px', color: '#C9A84C', marginBottom: '16px' },
              children: booking.artist.alias,
            },
          } : { type: 'div', props: { style: { marginBottom: '16px' }, children: '' } },
          // Session details row
          {
            type: 'div',
            props: {
              style: { display: 'flex', gap: '24px', alignItems: 'flex-end', flex: 1 },
              children: [
                // Details
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', gap: '8px', alignItems: 'center' },
                          children: [
                            { type: 'span', props: { style: { fontSize: '9px', color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', width: '60px' }, children: 'Date' } },
                            { type: 'span', props: { style: { fontSize: '12px', color: '#d4d4d4' }, children: fmtDateLong(booking.starts_at.toISOString(), tz) } },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', gap: '8px', alignItems: 'center' },
                          children: [
                            { type: 'span', props: { style: { fontSize: '9px', color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', width: '60px' }, children: 'Time' } },
                            { type: 'span', props: { style: { fontSize: '12px', color: '#d4d4d4', fontFamily: 'monospace' }, children: `${fmtTime(booking.starts_at.toISOString(), tz)} → ${fmtTime(booking.ends_at.toISOString(), tz)}` } },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: { display: 'flex', gap: '8px', alignItems: 'center' },
                          children: [
                            { type: 'span', props: { style: { fontSize: '9px', color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', width: '60px' }, children: 'Room' } },
                            { type: 'span', props: { style: { fontSize: '12px', color: '#d4d4d4' }, children: booking.room?.name ?? '—' } },
                          ],
                        },
                      },
                      booking.engineer ? {
                        type: 'div',
                        props: {
                          style: { display: 'flex', gap: '8px', alignItems: 'center' },
                          children: [
                            { type: 'span', props: { style: { fontSize: '9px', color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', width: '60px' }, children: 'Eng.' } },
                            { type: 'span', props: { style: { fontSize: '12px', color: '#d4d4d4' }, children: booking.engineer.name } },
                          ],
                        },
                      } : { type: 'div', props: { style: {}, children: '' } },
                    ],
                  },
                },
                // QR code
                {
                  type: 'div',
                  props: {
                    style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
                    children: [
                      { type: 'img', props: { src: qrDataUrl, style: { width: '80px', height: '80px' } } },
                      { type: 'span', props: { style: { fontSize: '8px', color: '#333', letterSpacing: '0.06em' }, children: 'Scan to view' } },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const svg = await satori(element as any, {
      width: 600,
      height: 300,
      fonts: [],
    });

    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 600 } });
    const png = resvg.render().asPng();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="session-${booking.id.slice(0,8)}.png"`);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(Buffer.from(png));
  } catch (err) {
    next(err);
  }
});
