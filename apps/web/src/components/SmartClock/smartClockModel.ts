import { SessionPhase, SessionStatus } from './useClockData';

export const CX = 160;
export const CY = 160;
export const R = {
  decoA: 150,
  decoB: 139,
  roomA: 129,
  roomB: 118,
  vocal: 107,
  phase: 97,
  face: 93,
  waveOut: 88,
  waveIn: 76,
  needleTip: 96,
} as const;

export const STATUS_COLOR: Record<SessionStatus, string> = {
  active: '#3B8BFF',
  ending_soon: '#F0A63A',
  overtime: '#D94A4A',
  idle: '#5A9BCB',
};

export const ROOM_COLOR: Record<string, string> = {
  'Main Studio': '#3B8BFF',
  'Studio B': '#9B6EFF',
  'Vocal Booth': '#1D9E75',
};

export const ROOM_R = [R.roomA, R.roomB, R.vocal] as const;
export const ROOM_PALETTE = ['#3B8BFF', '#9B6EFF', '#1D9E75'];

export const PHASE_COLOR: Record<SessionPhase, string> = {
  setup: '#8EA0B8',
  recording: '#3B8BFF',
  break: '#7C8794',
  review: '#1D9E75',
  wrap_up: '#F0A63A',
};

export const STATUS_ALPHA: Record<string, number> = {
  CONFIRMED: 0.88,
  PENDING: 0.42,
  COMPLETED: 0.55,
  CANCELLED: 0.12,
  NO_SHOW: 0.12,
};

export function polar(angle: number, radius: number) {
  const radians = (angle - 90) * (Math.PI / 180);
  return { x: CX + radius * Math.cos(radians), y: CY + radius * Math.sin(radians) };
}

export function arc(startAngle: number, endAngle: number, radius: number): string {
  let end = endAngle <= startAngle ? endAngle + 360 : endAngle;
  if (end - startAngle >= 360) end = startAngle + 359.99;
  const start = polar(startAngle, radius);
  const finish = polar(end, radius);
  const large = end - startAngle > 180 ? 1 : 0;
  return `M${start.x.toFixed(2)},${start.y.toFixed(2)} A${radius},${radius},0,${large},1,${finish.x.toFixed(2)},${finish.y.toFixed(2)}`;
}

export function isoAngle(iso: string): number {
  const date = new Date(iso);
  return ((date.getHours() * 60 + date.getMinutes()) / 1440) * 360;
}

export function nowAngle(): number {
  const date = new Date();
  return ((date.getHours() * 60 + date.getMinutes()) / 1440) * 360;
}

export function fmtTime(iso?: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtMs(milliseconds: number): string {
  if (milliseconds <= 0) return '00:00';
  const seconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function fmtMins(minutes: number | null | undefined): string {
  if (minutes == null) return '-';
  if (minutes < 0) return `${Math.abs(minutes)}m over`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

export type Personality = { label: string; sub: string };
const HOUR_PERSONAS: Array<{ min: number; max: number } & Personality> = [
  { min: 0, max: 6, label: 'GRAVEYARD HOURS', sub: 'The legendary sessions' },
  { min: 6, max: 10, label: 'OPENING UP', sub: 'Studio coming alive' },
  { min: 10, max: 13, label: 'MORNING SESSION', sub: 'Peak focus window' },
  { min: 13, max: 15, label: 'MIDDAY LULL', sub: 'Breath before the rush' },
  { min: 15, max: 20, label: 'PEAK HOURS', sub: 'Full studio energy' },
  { min: 20, max: 23, label: 'EVENING GRIND', sub: 'Night mode activated' },
  { min: 23, max: 24, label: 'LATE NIGHT', sub: 'Where classics are made' },
];

export function getPersonality(status: SessionStatus): Personality {
  if (status === 'overtime') return { label: 'RUNNING DEEP', sub: 'Overtime — keep going' };
  if (status === 'ending_soon') return { label: 'WRAPPING UP', sub: 'Closing this chapter' };
  if (status === 'active') return { label: 'IN SESSION', sub: 'Booth is live' };
  const hour = new Date().getHours();
  return HOUR_PERSONAS.find(persona => hour >= persona.min && hour < persona.max) ?? HOUR_PERSONAS[5];
}

export const WAVE_N = 64;
export const WAVE_HEIGHTS = Array.from({ length: WAVE_N }, (_, index) => {
  const time = index / WAVE_N;
  const value = Math.sin(time * Math.PI * 6.7) * 0.38 + Math.cos(time * Math.PI * 4.2) * 0.28 + Math.sin(time * Math.PI * 2.1) * 0.2 + 0.35;
  return Math.max(0.08, Math.min(1, value));
});
