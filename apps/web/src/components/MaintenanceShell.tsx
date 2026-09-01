import { BarChart3, Building2, CalendarCheck, HeartPulse, LayoutDashboard, LogOut, Radar, ShieldCheck, UserCog, Users, WalletCards } from 'lucide-react';
import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import OianoBrand from './OianoBrand';
import { useAuthStore } from '../store/auth.store';

export const maintenanceSections = [
  { label:'Overview', icon:LayoutDashboard, to:'/maintenance' },
  { label:'Signals', icon:Radar, to:'/maintenance/signals' },
  { label:'Studios', icon:Building2, to:'/maintenance/studios' },
  { label:'Studio Operators', icon:UserCog, to:'/maintenance/operators' },
  { label:'Creators', icon:Users, to:'/maintenance/creators' },
  { label:'Bookings', icon:CalendarCheck, to:'/maintenance/bookings' },
  { label:'Finance', icon:WalletCards, to:'/maintenance/finance' },
  { label:'Growth', icon:BarChart3, to:'/maintenance/growth' },
  { label:'System health', icon:HeartPulse, to:'/maintenance/health' },
  { label:'Audit trail', icon:ShieldCheck, to:'/maintenance/audit' },
];

function isActive(pathname:string,to:string){return to==='/maintenance'?pathname==='/maintenance':pathname.startsWith(to);}

export default function MaintenanceShell({children,toolbar}:{children:ReactNode;toolbar?:ReactNode;title?:string;eyebrow?:string}){
  const navigate=useNavigate(); const {pathname}=useLocation(); const {user,logout}=useAuthStore();
  const signOut=()=>{logout();navigate('/enter')};
  return <main className="min-h-screen bg-studio-bg text-white md:pl-[238px]">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[238px] flex-col border-r border-white/[.065] bg-studio-surface md:flex">
      <button onClick={()=>navigate('/maintenance')} className="flex h-[76px] items-center gap-3 border-b border-white/[.06] px-6 text-left"><OianoBrand variant="compact" size={22} subtitle="Maintenance"/></button>
      <nav aria-label="Maintenance sections" className="flex-1 space-y-1 p-4">{maintenanceSections.map(({label,icon:Icon,to})=>{const active=isActive(pathname,to);return <button key={to} onClick={()=>navigate(to)} aria-current={active?'page':undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition ${active?'bg-dome/[.1] text-dome':'text-zinc-600 hover:bg-white/[.025] hover:text-zinc-300'}`}><Icon size={15}/>{label}{active&&<i className="ml-auto h-1.5 w-1.5 rounded-full bg-dome"/>}</button>})}</nav>
      <div className="border-t border-white/[.06] p-4"><p className="truncate px-3 text-[9px] text-zinc-700">{user?.email}</p><button onClick={signOut} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-zinc-600 hover:bg-white/[.025] hover:text-white"><LogOut size={15}/>Sign out</button></div>
    </aside>
    <header className="sticky top-0 z-20 border-b border-white/[.065] bg-studio-bg/90 backdrop-blur-xl">
      <div className="flex h-[68px] items-center justify-between px-5 md:h-[76px] md:px-8"><button onClick={()=>navigate('/maintenance')} className="flex items-center gap-3 md:hidden"><OianoBrand variant="compact" size={19}/></button><div className="hidden md:block">{toolbar}</div><button aria-label="Sign out" onClick={signOut} className="ml-auto grid h-9 w-9 place-items-center rounded-lg border border-white/[.06] text-zinc-600 hover:text-white"><LogOut size={15}/></button></div>
      <nav aria-label="Maintenance mobile sections" className="flex gap-1 overflow-x-auto border-t border-white/[.04] px-3 py-2 md:hidden">{maintenanceSections.map(({label,icon:Icon,to})=>{const active=isActive(pathname,to);return <button key={to} onClick={()=>navigate(to)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] ${active?'bg-dome/[.1] text-dome':'text-zinc-600'}`}><Icon size={12}/>{label}</button>})}</nav>
    </header>
    {children}
  </main>;
}
