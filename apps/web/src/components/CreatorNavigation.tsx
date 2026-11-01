import './CreatorNavigation.css';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { activeCreatorDestination, creatorNavigation } from '../lib/creatorNavigation';

export default function CreatorNavigation() {
  const role = useAuthStore(state => state.user?.role);
  const { pathname } = useLocation();
  const items = creatorNavigation(role);
  if (!items.length) return null;
  const active = activeCreatorDestination(role, pathname);
  return <>
    <nav className="creator-navigation" aria-label="Creative workspace">
      <div className="creator-destinations">
        {items.map(item => <Link key={item.path} to={item.path} aria-current={active === item.path ? 'page' : undefined}>{item.label}</Link>)}
      </div>
      <div className="creator-tools">
        <Link to="/communications" aria-current={pathname.startsWith('/communications') ? 'page' : undefined}>Messages</Link>
        <Link to="/access" aria-current={pathname === '/access' ? 'page' : undefined}>Account</Link>
      </div>
    </nav>
  </>;
}
