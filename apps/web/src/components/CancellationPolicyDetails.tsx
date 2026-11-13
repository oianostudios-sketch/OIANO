type CancellationPolicyDetailsProps = {
  walletEnabled: boolean;
};

export default function CancellationPolicyDetails({ walletEnabled }: CancellationPolicyDetailsProps) {
  if (!walletEnabled) {
    return (
      <p className="text-zinc-500 text-sm">
        Cancellation terms for pilot sessions are not available here yet. Please contact the studio before changing your session.
      </p>
    );
  }

  return (
    <>
      <p>We know life as an artist is unpredictable. Here's how we handle changes:</p>
      <div className="space-y-2">
        <div className="flex gap-3">
          <span className="text-dome font-mono text-xs mt-0.5">72h+</span>
          <span>Cancel or reschedule with no fee. Your credits are returned in full.</span>
        </div>
        <div className="flex gap-3">
          <span className="text-dome font-mono text-xs mt-0.5">48h</span>
          <span>50% of session credits are retained. The rest return to your wallet.</span>
        </div>
        <div className="flex gap-3">
          <span className="text-dome font-mono text-xs mt-0.5">24h</span>
          <span>Last-minute cancellations retain the full session cost. Reach out to the studio if there's an emergency — we're human.</span>
        </div>
        <div className="flex gap-3">
          <span className="text-dome font-mono text-xs mt-0.5">Now</span>
          <span>Use the Reschedule button above to move to a new slot at no extra charge (72h+ notice). The studio is always on your side.</span>
        </div>
      </div>
      <p className="text-zinc-600 text-xs pt-1">Rescheduling is always free with sufficient notice. Contact the studio directly for anything not covered here.</p>
    </>
  );
}
