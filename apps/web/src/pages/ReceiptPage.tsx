import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', id],
    queryFn: async () => (await api.get(`/bookings/${id}`)).data,
    enabled: !!id,
  });

  // Auto-trigger print once data is loaded
  useEffect(() => {
    if (!booking) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [booking]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-zinc-400 text-sm">Preparing receipt…</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-zinc-400 text-sm">Booking not found.</p>
      </div>
    );
  }

  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);
  const durationHrs = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const total = Number(booking.total_usd ?? 0);

  return (
    <>
      {/* Print styles injected inline so they work without a build step */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap');
        @page { margin: 40px; size: A4; }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        body { margin: 0; font-family: 'DM Sans', sans-serif; background: #f9f9f9; }
      `}</style>

      <div className="no-print fixed top-4 left-4 z-50 flex gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-xs bg-zinc-800 text-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={() => window.print()}
          className="text-xs bg-black text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Receipt document */}
      <div
        style={{
          maxWidth: 680,
          margin: '60px auto',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 24px rgba(0,0,0,0.08)',
          overflow: 'hidden',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {/* Gold header band */}
        <div
          style={{
            background: '#0a0a0a',
            padding: '32px 40px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <p
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 28,
                color: '#C9A84C',
                margin: 0,
                letterSpacing: 2,
              }}
            >
              OIANO
            </p>
            <p style={{ color: '#666', fontSize: 11, margin: '4px 0 0', letterSpacing: 1 }}>
              DREAMZ MUSIC LAB · STUDIO RECEIPT
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ color: '#555', fontSize: 11, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>
              Receipt #{booking.id?.slice(0, 8).toUpperCase()}
            </p>
            <p style={{ color: '#333', fontSize: 11, margin: '4px 0 0', fontFamily: "'JetBrains Mono', monospace" }}>
              {new Date().toLocaleDateString('en-US')}
            </p>
          </div>
        </div>

        {/* Gold accent line */}
        <div style={{ height: 3, background: 'linear-gradient(90deg, #C9A84C, #E2C97E, #C9A84C)' }} />

        {/* Body */}
        <div style={{ padding: '36px 40px' }}>

          {/* Artist + session title */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 2, margin: '0 0 4px' }}>
              Billed to
            </p>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#111', margin: 0 }}>
              {booking.artist?.name ?? 'Artist'}
            </p>
            {booking.artist?.alias && (
              <p style={{ fontSize: 13, color: '#C9A84C', margin: '2px 0 0' }}>
                {booking.artist.alias}
              </p>
            )}
          </div>

          {/* Session details table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 32 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                <th style={{ textAlign: 'left', padding: '0 0 10px', fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 500 }}>
                  Description
                </th>
                <th style={{ textAlign: 'right', padding: '0 0 10px', fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 500 }}>
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '16px 0', verticalAlign: 'top' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#111' }}>
                    {booking.service?.name ?? 'Studio Session'}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#777' }}>
                    {fmtDate(startsAt)}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#999', fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtTime(startsAt)} → {fmtTime(endsAt)} ({durationHrs.toFixed(1)}h)
                  </p>
                  {booking.room && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#999' }}>
                      Room: {booking.room.name}
                    </p>
                  )}
                  {booking.engineer && (
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#999' }}>
                      Engineer: {booking.engineer.name}
                    </p>
                  )}
                </td>
                <td style={{ padding: '16px 0', textAlign: 'right', verticalAlign: 'top' }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#111' }}>
                    ${total.toFixed(2)}
                  </p>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: '20px 0 0', fontSize: 13, color: '#555' }}>Total</td>
                <td
                  style={{
                    padding: '20px 0 0',
                    textAlign: 'right',
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#111',
                    fontFamily: "'Playfair Display', serif",
                  }}
                >
                  ${total.toFixed(2)}
                </td>
              </tr>
              <tr>
                <td />
                <td style={{ paddingTop: 4, textAlign: 'right' }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: 20,
                      background: booking.payment?.status === 'PAID' ? '#d1fae5' : '#fef3c7',
                      color: booking.payment?.status === 'PAID' ? '#065f46' : '#92400e',
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: 0.5,
                    }}
                  >
                    {booking.payment?.status ?? 'UNPAID'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Notes */}
          {booking.notes && (
            <div
              style={{
                background: '#fafafa',
                border: '1px solid #eee',
                borderRadius: 8,
                padding: '16px 20px',
                marginBottom: 32,
              }}
            >
              <p style={{ fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 1.5, margin: '0 0 8px' }}>
                Notes
              </p>
              <p style={{ fontSize: 13, color: '#555', margin: 0, lineHeight: 1.6 }}>{booking.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              borderTop: '1px solid #f0f0f0',
              paddingTop: 24,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <p style={{ fontSize: 12, color: '#C9A84C', fontFamily: "'Playfair Display', serif", margin: 0 }}>
                Dreamz Music Lab
              </p>
              <p style={{ fontSize: 11, color: '#bbb', margin: '4px 0 0' }}>
                Thank you for creating with us.
              </p>
            </div>
            <p
              style={{
                fontSize: 10,
                color: '#ccc',
                fontFamily: "'JetBrains Mono', monospace",
                margin: 0,
                textAlign: 'right',
              }}
            >
              oiano-studioos.io<br />
              Powered by OIANO StudioOS
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
