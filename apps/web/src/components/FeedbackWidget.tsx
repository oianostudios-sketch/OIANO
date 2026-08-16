import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { MessageSquarePlus, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { useToast } from './Toast';

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'BUG', label: 'Bug' },
  { value: 'CONFUSING', label: 'Confusing experience' },
  { value: 'FEATURE_REQUEST', label: 'Feature request' },
  { value: 'MISSING_INFO', label: 'Missing information' },
  { value: 'OTHER', label: 'Other' },
];

// Global feedback entry point (FEEDBACK-01) — mounted once in App.tsx so it's
// reachable from every authenticated page without hunting for it. Captures
// page/category/description/user context automatically (FEEDBACK-02) and
// confirms on submit (FEEDBACK-03).
export default function FeedbackWidget() {
  const token = useAuthStore((s) => s.token);
  const { pathname } = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('BUG');
  const [description, setDescription] = useState('');

  const submit = useMutation({
    mutationFn: () => api.post('/feedback', { category, page: pathname, description }),
    onSuccess: () => {
      toast.success('Feedback sent — thank you');
      setDescription('');
      setOpen(false);
    },
    onError: (error: any) => toast.error(error?.response?.data?.error ?? 'Could not send feedback'),
  });

  if (!token) return null; // feedback route requires auth — no point showing this pre-login

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        style={{
          position: 'fixed', right: 20, bottom: 20, zIndex: 9998,
          width: 44, height: 44, borderRadius: '50%',
          background: '#141414', border: '1px solid #2a2a2a', color: '#C9A84C',
          display: 'grid', placeItems: 'center', cursor: 'pointer',
          boxShadow: '0 4px 18px rgba(0,0,0,.45)',
        }}
      >
        <MessageSquarePlus size={18} />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 340, background: '#141414', border: '1px solid #2a2a2a', borderRadius: 14, padding: 18 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: '#e8e6e1' }}>Send feedback</p>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 0, color: '#666', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <label style={{ display: 'block', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#777', marginBottom: 6 }}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ width: '100%', background: '#0f0f0f', border: '1px solid #252525', color: '#f0ede8', borderRadius: 8, padding: '9px 10px', fontSize: 13, marginBottom: 12 }}
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>

            <label style={{ display: 'block', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#777', marginBottom: 6 }}>What happened?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe what you saw, and what you expected instead..."
              style={{ width: '100%', background: '#0f0f0f', border: '1px solid #252525', color: '#f0ede8', borderRadius: 8, padding: '9px 10px', fontSize: 13, resize: 'vertical', marginBottom: 6 }}
            />
            <p style={{ fontSize: 10, color: '#555', marginBottom: 14 }}>Reporting from: {pathname}</p>

            <button
              onClick={() => submit.mutate()}
              disabled={!description.trim() || submit.isPending}
              style={{
                width: '100%', background: '#C9A84C', color: '#0a0a0a', fontWeight: 700, fontSize: 13,
                padding: '10px 16px', borderRadius: 9, border: 0, cursor: 'pointer',
                opacity: !description.trim() || submit.isPending ? 0.5 : 1,
              }}
            >
              {submit.isPending ? 'Sending…' : 'Send feedback'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
