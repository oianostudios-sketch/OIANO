import type { ReactNode } from 'react';
import ArtistAvatar from './ArtistAvatar';
import './CreativeJourney.css';

interface CreativeIdentityProps {
  name: string;
  alias?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  interests?: string[];
  greeting?: string;
  actions?: ReactNode;
}

export default function CreativeIdentity({ name, alias, bio, avatarUrl, interests = [], greeting, actions }: CreativeIdentityProps) {
  const displayName = alias?.trim() || name;
  return (
    <section className="creative-identity" aria-label="Your creative identity">
      <div className="creative-identity-heading">
        <ArtistAvatar src={avatarUrl} name={displayName} size={64} shape="portrait" decorative />
        <div className="creative-identity-copy">
          <p className="creative-eyebrow">{greeting || 'Your creative identity'}</p>
          <h1>{displayName}</h1>
          {alias?.trim() && alias !== name && <p className="creative-identity-name">{name}</p>}
        </div>
      </div>
      {bio?.trim() ? <p className="creative-identity-bio">{bio}</p> : (
        <p className="creative-identity-bio creative-muted">Your profile can describe what you make and how you like to work.</p>
      )}
      {interests.length > 0 && <div className="creative-identity-interests">
        <h2>Interested in collaborating on</h2>
        <ul>{interests.map(interest => <li key={interest}>{interest}</li>)}</ul>
      </div>}
      {actions && <div className="creative-actions">{actions}</div>}
      <details className="creative-access">
        <summary>Account access</summary>
        <p>This account uses Artist access. Your contribution and responsibilities belong to each project; your profile description does not grant permissions.</p>
      </details>
    </section>
  );
}
