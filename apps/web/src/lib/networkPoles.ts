import type { UserRole } from './accountArchitecture';

export type NetworkPoleId = 'ARTIST' | 'STUDIO' | 'CREATIVE' | 'COLLABORATOR' | 'OIANO';

export interface NetworkPole {
  id: NetworkPoleId;
  label: string;
  statement: string;
  contributes: string;
  receives: string;
  connectsTo: NetworkPoleId[];
  actions: Array<{ label: string; path: string }>;
  measure: string;
  accent: string;
}

export const NETWORK_POLES: Record<NetworkPoleId, NetworkPole> = {
  ARTIST: {
    id: 'ARTIST', label: 'Artist', statement: 'Turn creative ambition into a trusted professional record.',
    contributes: 'Talent, projects, bookings and reputation',
    receives: 'Studio access, verified credits, identity, rights records and opportunities',
    connectsTo: ['STUDIO', 'CREATIVE', 'COLLABORATOR'],
    actions: [{ label: 'Discover studios', path: '/discover' }, { label: 'Start a booking', path: '/book' }, { label: 'Open projects', path: '/projects' }],
    measure: 'Sessions completed · credits confirmed · relationships created', accent: '#5A9BCB',
  },
  STUDIO: {
    id: 'STUDIO', label: 'Studio', statement: 'Turn capacity and expertise into productive creative relationships.',
    contributes: 'Rooms, equipment, teams and availability',
    receives: 'Customers, utilization, workflow control, payments and business intelligence',
    connectsTo: ['ARTIST', 'CREATIVE', 'OIANO'],
    actions: [{ label: 'Open Studio Pulse', path: '/pulse' }, { label: 'Review calendar', path: '/calendar' }, { label: 'Run today', path: '/runsheet' }],
    measure: 'Artists served · rooms utilized · repeat relationships', accent: '#C9A84C',
  },
  CREATIVE: {
    id: 'CREATIVE', label: 'Creative Professional', statement: 'Make every contribution visible, attributable and portable.',
    contributes: 'Skill, time and creative contribution',
    receives: 'Work opportunities, attribution, portfolio history and professional visibility',
    connectsTo: ['ARTIST', 'STUDIO', 'COLLABORATOR'],
    actions: [{ label: 'Contribution inbox', path: '/contributions' }, { label: 'Open workrooms', path: '/workrooms' }, { label: 'Discover the network', path: '/discover' }],
    measure: 'Assignments completed · credits accepted · portfolio growth', accent: '#9B8AFB',
  },
  COLLABORATOR: {
    id: 'COLLABORATOR', label: 'Collaborator', statement: 'Join a project without losing recognition or control.',
    contributes: 'Performances, writing and production input',
    receives: 'Documented roles, approvals, ownership evidence and network growth',
    connectsTo: ['ARTIST', 'CREATIVE', 'OIANO'],
    actions: [{ label: 'Contribution inbox', path: '/contributions' }, { label: 'Open workrooms', path: '/workrooms' }, { label: 'Review responsibilities', path: '/access' }],
    measure: 'Invitations accepted · roles confirmed · rights recorded', accent: '#D77AB7',
  },
  OIANO: {
    id: 'OIANO', label: 'OIANO Platform', statement: 'Coordinate the network while protecting trust and accountability.',
    contributes: 'Infrastructure, trust and coordination',
    receives: 'Sustainable revenue from providing measurable value',
    connectsTo: ['ARTIST', 'STUDIO', 'CREATIVE', 'COLLABORATOR'],
    actions: [{ label: 'System health', path: '/maintenance/health' }, { label: 'Audit evidence', path: '/maintenance/audit' }, { label: 'Network finance', path: '/maintenance/finance' }],
    measure: 'Successful outcomes · trusted records · healthy network growth', accent: '#72B794',
  },
};

export function networkPoleForRole(role?: UserRole | null): NetworkPole {
  if (role === 'STUDIO_ADMIN') return NETWORK_POLES.STUDIO;
  if (role === 'PRODUCER' || role === 'ENGINEER') return NETWORK_POLES.CREATIVE;
  if (role === 'OIANO_ADMIN') return NETWORK_POLES.OIANO;
  return NETWORK_POLES.ARTIST;
}

export function networkActionsForRole(role?: UserRole | null): NetworkPole['actions'] {
  if (role === 'ENGINEER') return [
    { label: 'Contribution inbox', path: '/contributions' },
    { label: 'Open workrooms', path: '/workrooms' },
    { label: 'Review runsheet', path: '/runsheet' },
  ];
  return networkPoleForRole(role).actions;
}
