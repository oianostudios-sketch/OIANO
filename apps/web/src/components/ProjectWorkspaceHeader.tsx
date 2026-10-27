import { CalendarDays, FileAudio, Users } from 'lucide-react';

const PHASES = ['PRE_PRODUCTION', 'TRACKING', 'EDITING', 'MIXING', 'MASTERING', 'DELIVERED'] as const;
export const PHASE_LABELS: Record<string, string> = {
  PRE_PRODUCTION: 'Pre-production', TRACKING: 'Tracking', EDITING: 'Editing',
  MIXING: 'Mixing', MASTERING: 'Mastering', DELIVERED: 'Delivered',
};

interface ProjectWorkspaceHeaderProps {
  title: string;
  phase: string;
  active: boolean;
  producerName: string | null;
  updatedLabel: string;
  sessions: number;
  collaborators: number;
  files: number;
}

export default function ProjectWorkspaceHeader({
  title, phase, active, producerName, updatedLabel, sessions, collaborators, files,
}: ProjectWorkspaceHeaderProps) {
  const phaseIndex = PHASES.findIndex(item => item === phase);

  return (
    <>
      <header className="project-workspace-hero">
        <div className="project-workspace-art" aria-hidden="true" />
        <div className="project-workspace-hero-copy">
          <p className="project-workspace-eyebrow">{active ? 'Active project' : 'Archived project'} <span aria-hidden="true"> / </span> {PHASE_LABELS[phase] ?? phase}</p>
          <h2>{title}</h2>
          <p className="project-workspace-byline">{producerName ? `With ${producerName}` : 'Producer to be assigned'}</p>
          <p className="project-workspace-updated">{updatedLabel}</p>
          <dl className="project-workspace-stats">
            {[{ Icon: CalendarDays, value: sessions, label: 'Sessions' }, { Icon: Users, value: collaborators, label: 'Collaborators' }, { Icon: FileAudio, value: files, label: 'Files' }].map(({ Icon, value, label }) => (
              <div key={label}>
                <dt><Icon size={16} aria-hidden="true" />{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>
      <nav className="project-workspace-sections" aria-label="Project workspace sections">
        <a href="#project-decisions">Decisions</a>
        <a href="#project-conversation">Conversation</a>
        <a href="#project-context">People &amp; sessions</a>
        <a href="#project-files">Files</a>
      </nav>
      <section className="project-workspace-path" aria-labelledby="project-path-title">
        <div className="project-workspace-path-heading">
          <h3 id="project-path-title">Production path</h3>
          <p>Project phase, not a completion score</p>
        </div>
        <ol aria-label="Production phases">
          {PHASES.map((item, index) => (
            <li key={item} aria-current={item === phase ? 'step' : undefined} className={index <= phaseIndex ? 'project-phase-reached' : undefined}>
              <span aria-hidden="true" />
              {PHASE_LABELS[item]}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
