import './CreativeJourney.css';

interface ContributionContextProps {
  displayName: string;
  role: string;
  pendingCredits: number;
  pendingRights: number;
}

export default function ContributionContext({ displayName, role, pendingCredits, pendingRights }: ContributionContextProps) {
  return (
    <section className="contribution-context" aria-labelledby="your-contribution-title">
      <p className="creative-eyebrow">Your part in this project</p>
      <h2 id="your-contribution-title">{displayName}</h2>
      <p className="contribution-role">{role.replaceAll('_', ' ').toLowerCase()}</p>
      <p className="creative-muted">Accepted contribution. This role describes your place in this project, not your whole creative identity.</p>
      <div className="contribution-next">
        <h3>Pick up the work</h3>
        {pendingCredits > 0 && <a className="creative-button" href="#contribution-credits">Review {pendingCredits} proposed credit{pendingCredits === 1 ? '' : 's'}</a>}
        {pendingRights > 0 && <a className="creative-button" href="#contribution-rights">Review {pendingRights} ownership proposal{pendingRights === 1 ? '' : 's'}</a>}
        {!pendingCredits && !pendingRights && <p className="creative-muted">No credit or ownership response is waiting on you. Use the conversation to agree the next step with the team.</p>}
        <a className="creative-text-link" href="#contribution-conversation">Open project conversation</a>
      </div>
      <nav className="contribution-sections" aria-label="Contribution workspace sections">
        <a href="#contribution-team">People</a>
        <a href="#contribution-conversation">Conversation</a>
        <a href="#contribution-deliverables">Sessions & deliverables</a>
        <a href="#contribution-credits">Your credits</a>
        <a href="#contribution-rights">Rights record</a>
      </nav>
    </section>
  );
}
