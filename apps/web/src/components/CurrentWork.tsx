import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FolderKanban } from 'lucide-react';
import { api } from '../lib/api';
import { PHASE_LABELS } from './ProjectWorkspaceHeader';
import './CreativeJourney.css';

interface CurrentProject {
  id: string;
  title: string;
  phase: string;
  is_active: boolean;
  producer?: { name: string; alias?: string | null } | null;
}

export default function CurrentWork() {
  const { data, isPending, isError, isFetching, refetch } = useQuery<CurrentProject[]>({
    queryKey: ['artist-projects'],
    queryFn: async () => (await api.get('/artist-projects')).data,
  });
  const projects = (data ?? []).filter(project => project.is_active && project.phase !== 'DELIVERED');

  return (
    <section className="creative-current-work" aria-labelledby="current-work-title">
      <header className="creative-section-heading">
        <div><p className="creative-eyebrow">Pick up where you left off</p><h2 id="current-work-title">Your current work</h2></div>
        <Link className="creative-text-link" to="/projects">All projects <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </header>
      {isPending && <p className="creative-muted" role="status">Loading your projects…</p>}
      {isError && <div className="creative-read-error" role="alert">
        <p>We couldn’t refresh your projects.{data ? ' The saved list below may be out of date.' : ' Try again to see your work.'}</p>
        <button type="button" className="creative-button" onClick={() => refetch()} disabled={isFetching}>{isFetching ? 'Checking…' : 'Try again'}</button>
      </div>}
      {data && projects.length > 0 && <ul className="creative-work-list">
        {projects.slice(0, 4).map(project => <li key={project.id}>
          <Link to={`/projects?project=${encodeURIComponent(project.id)}`} className="creative-work-link">
            <span className="creative-work-icon"><FolderKanban size={21} aria-hidden="true" /></span>
            <span className="creative-work-copy"><strong>{project.title}</strong><span>{project.producer ? `With ${project.producer.alias || project.producer.name}` : 'Producer to be assigned'}</span></span>
            <span className="creative-work-phase">{PHASE_LABELS[project.phase] ?? project.phase}</span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </li>)}
      </ul>}
      {data && !isError && projects.length === 0 && <div className="creative-work-empty">
        <h3>Your next collaboration can start with an invitation.</h3>
        <p>Projects linked to you appear here. Review your contribution invitations to find work you can join.</p>
        <Link className="creative-button" to="/contributions">Review contributions</Link>
      </div>}
    </section>
  );
}
