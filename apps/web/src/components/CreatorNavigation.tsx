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
    <style>{`
      .creator-navigation{display:flex;align-items:center;justify-content:center;gap:8px;padding:10px 16px;background:#0a0a0a;border-bottom:1px solid #252525;flex-wrap:wrap}
      .creator-destinations,.creator-tools{display:flex;align-items:center;gap:8px}
      .creator-navigation a{color:#aaa;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:12px;line-height:1.4}
      .creator-navigation a:hover,.creator-navigation a[aria-current="page"]{color:#E2C97E;background:#C9A84C12}
      .creator-navigation a:focus-visible{outline:2px solid #C9A84C;outline-offset:2px}
      .creator-tools{border-left:1px solid #2a2a2a;padding-left:8px}
      @media(max-width:767px){.creator-navigation{display:block;padding:8px}.creator-destinations{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:2px}.creator-navigation a{padding:12px 2px;font-size:11px;text-align:center}.creator-tools{justify-content:center;gap:24px;border-left:0;border-top:1px solid #202020;margin-top:4px;padding:0}.creator-tools a{font-size:12px;padding:10px 12px}}
    `}</style>
  </>;
}
