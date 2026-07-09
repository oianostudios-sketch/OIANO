import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useToast } from './Toast';

const LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Outstanding'];

interface Props {
  bookingId: string;
  engineerName: string;
  existing?: { artist_rating: number | null; artist_testimonial: string | null };
}

export default function ArtistReviewForm({ bookingId, engineerName, existing }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rating, setRating] = useState(existing?.artist_rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(existing?.artist_testimonial ?? '');
  const [open, setOpen] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      api.patch(`/bookings/${bookingId}/artist-review`, {
        artist_rating: rating,
        artist_testimonial: text.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
      toast.success('Review saved — thank you');
      setOpen(false);
    },
    onError: () => toast.error('Failed to save review'),
  });

  const hasReview = !!existing?.artist_rating;

  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="label-mono">Rate your engineer</p>
          <p className="text-zinc-500 text-xs mt-0.5">{engineerName}</p>
        </div>
        {hasReview && !open ? (
          <div className="flex items-center gap-2">
            <span className="text-gold text-sm">{'★'.repeat(existing!.artist_rating!)}</span>
            <button onClick={() => setOpen(true)} className="text-zinc-500 text-xs hover:text-white transition-colors">Edit</button>
          </div>
        ) : (
          !open && (
            <button
              onClick={() => setOpen(true)}
              className="text-xs bg-gold/10 border border-gold/20 text-gold px-3 py-1.5 rounded-lg hover:bg-gold/20 transition-colors"
            >
              Leave review
            </button>
          )
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-4 animate-surface">
          {/* Star rating */}
          <div>
            <p className="text-zinc-500 text-xs mb-2">How was the session?</p>
            <div className="flex gap-2">
              {[1,2,3,4,5].map((r) => (
                <button
                  key={r}
                  onMouseEnter={() => setHover(r)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(r === rating ? 0 : r)}
                  className={`text-2xl transition-colors ${
                    r <= (hover || rating) ? 'text-gold' : 'text-studio-border'
                  }`}
                >
                  ★
                </button>
              ))}
              {(hover || rating) > 0 && (
                <span className="text-zinc-500 text-sm self-center ml-1">
                  {LABELS[hover || rating]}
                </span>
              )}
            </div>
          </div>

          {/* Testimonial */}
          <div>
            <label className="text-zinc-500 text-xs block mb-1.5">
              Testimonial <span className="text-zinc-700">(shown on engineer profile)</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`What made ${engineerName} great to work with?`}
              rows={3}
              maxLength={500}
              className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gold transition-colors resize-none"
            />
            <p className="text-zinc-700 text-xs text-right mt-0.5">{text.length}/500</p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setOpen(false)}
              className="flex-1 border border-studio-border text-zinc-500 py-2 rounded-lg text-sm hover:text-white transition-colors">
              Cancel
            </button>
            <button
              onClick={() => submit.mutate()}
              disabled={!rating || submit.isPending}
              className="flex-1 bg-gold text-black font-semibold py-2 rounded-lg text-sm hover:bg-gold-light transition-colors disabled:opacity-40"
            >
              {submit.isPending ? 'Saving…' : 'Submit review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
