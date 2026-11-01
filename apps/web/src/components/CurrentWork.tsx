import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FolderKanban } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import { PHASE_LABELS } from './ProjectWorkspaceHeader';
import './CreativeJourney.css';

interface CurrentProject {
  id: string;
  title: string;
  phase: string;
  is_active: boolean;
  producer?: { name: string; alias?: string | null } | null;
  artist?: { name: string; alias?: string | null } | null;
  participants?: Array<{ display_name?: string | null; role?: string | null }>;
}

interface CurrentContribution {
  id: string;
  status: string;
  role: string;
  project: CurrentProject;
}

export default function CurrentWork() {
  const professional = useAuthStore(state => state.user?.role === 'PRODUCER');
  const projectsPath = professional ? '/producer' : '/projects';
  const { data, isPending, isError, isFetching, refetch } = useQuery<CurrentProject[] | { projects: CurrentProject[] }>({
    queryKey: professional ? ['producer', 'me'] : ['artist-projects'],
    queryFn: async () => (await api.get(professional ? '/producer/me' : '/artist-projects')).data,
  });
  const contributions = useQuery<CurrentContribution[]>({
    queryKey: ['contribution-inbox'],
    queryFn: async () => (await api.get('/contributions/inbox')).data,
  });
  const projects = (Array.isArray(data) ? data : data?.projects ?? []).filter(project => project.is_active && project.phase !== 'DELIVERED');
  const accepted = (contributions.data ?? []).filter(item =>
    item.status === 'ACTIVE' && item.project.is_active && item.project.phase !== 'DELIVERED');
  const pendingInvitations = (contributions.data ?? []).filter(item => item.status === 'INVITED').length;
  const work = new Map<string, { project: CurrentProject; href: string; role?: string }>();
  for (const item of accepted) {
    if (!work.has(item.project.id)) work.set(item.project.id, {
      project: item.project,
      href: `/contributions/${encodeURIComponent(item.id)}/workspace`,
      role: item.role.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase()),
    });
  }
  for (const project of projects) {
    if (!work.has(project.id)) work.set(project.id, {
      project, href: professional ? `/producer/projects/${encodeURIComponent(project.id)}` : `/projects?project=${encodeURIComponent(project.id)}`,
    });
  }

  return (
    <section className="creative-current-work" aria-labelledby="current-work-title">
      <header className="creative-section-heading">
        <div><p className="creative-eyebrow">Pick up where you left off</p><h2 id="current-work-title">Your current work</h2></div>
        <div className="creative-work-destinations">
          <Link className="creative-text-link" to={projectsPath}>All projects <ArrowUpRight size={16} aria-hidden="true" /></Link>
          <Link className="creative-text-link" to="/contributions">All contributions <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
      </header>
      {(isPending || contributions.isPending) && <p className="creative-muted" role="status">Loading your projects and contributions…</p>}
      {isError && <div className="creative-read-error" role="alert">
        <p>We couldn’t refresh your projects.{data ? ' The saved list below may be out of date.' : ' Try again to see your work.'}</p>
        <button type="button" className="creative-button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Checking…' : 'Try again'}</button>
      </div>}
      {contributions.isError && <div className="creative-read-error" role="alert">
        <p>We couldn’t refresh your contributions.{contributions.data ? ' The saved list below may be out of date.' : ' Try again to see your accepted work.'}</p>
        <button type="button" className="creative-button" onClick={() => contributions.refetch()} disabled={contributions.isFetching}>{contributions.isFetching ? 'Checking…' : 'Try again'}</button>
      </div>}
      {pendingInvitations > 0 && <div className="creative-invitation-notice" aria-label="Contribution invitations">
        <p>{pendingInvitations} {pendingInvitations === 1 ? 'invitation waiting' : 'invitations waiting'} for your decision.</p>
        <Link className="creative-text-link" to="/contributions">Review invitations <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </div>}
      {work.size > 0 && <ul className="creative-work-list">
        {[...work.values()].slice(0, 4).map(({ project, href, role }) => <li key={project.id}>
          <Link to={href} className="creative-work-link">
            <span className="creative-work-icon"><FolderKanban size={21} aria-hidden="true" /></span>
            <span className="creative-work-copy">
              <strong>{project.title}</strong>
              {role && <span>Your role: {role}</span>}
              <span>{professional && project.artist
                ? `With ${project.artist.alias || project.artist.name}`
                : project.producer ? `With ${project.producer.alias || project.producer.name}` : professional ? 'Project team' : 'Producer to be assigned'}</span>
              {!!project.participants?.length && <span className="creative-work-collaborators">{project.participants.slice(0, 2).map(person => person.display_name).filter(Boolean).join(' · ')}{project.participants.length > 2 ? ` · +${project.participants.length - 2}` : ''}</span>}
            </span>
            <span className="creative-work-phase">{PHASE_LABELS[project.phase] ?? project.phase}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </li>)}
      </ul>}
      {data && contributions.data && !isError && !contributions.isError && work.size === 0 && <div className="creative-work-empty">
        <h3>Your next collaboration can start with an invitation.</h3>
        <p>Projects linked to you appear here. Review your contribution invitations to find work you can join.</p>
        <Link className="creative-button" to="/contributions">Review contributions</Link>
      </div>}
    </section>
  );
}
