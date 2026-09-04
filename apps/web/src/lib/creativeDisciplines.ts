export const CREATIVE_DISCIPLINES = [
  { id: 'PRODUCER', label: 'Producer', description: 'Shape recordings, arrangements and the creative direction.' },
  { id: 'RECORDING_ENGINEER', label: 'Recording engineer', description: 'Capture sessions and manage recording systems.' },
  { id: 'MIX_ENGINEER', label: 'Mix engineer', description: 'Turn recorded material into a finished mix.' },
  { id: 'MASTERING_ENGINEER', label: 'Mastering engineer', description: 'Prepare final masters for release and delivery.' },
  { id: 'SONGWRITER', label: 'Songwriter', description: 'Write lyrics, melodies and song structures.' },
  { id: 'COMPOSER', label: 'Composer', description: 'Create original musical works and scores.' },
  { id: 'MUSICIAN', label: 'Musician', description: 'Contribute instrumental performance.' },
  { id: 'VOCALIST', label: 'Vocalist', description: 'Contribute lead or supporting vocal performance.' },
  { id: 'DJ', label: 'DJ', description: 'Perform, curate and create music for live audiences.' },
  { id: 'CREATIVE_DIRECTOR', label: 'Creative director', description: 'Guide the visual and creative presentation of a project.' },
  { id: 'PHOTOGRAPHER', label: 'Photographer', description: 'Create artist, studio and campaign photography.' },
  { id: 'VIDEOGRAPHER', label: 'Videographer', description: 'Create music video and behind-the-scenes content.' },
] as const;

export type CreativeDiscipline = typeof CREATIVE_DISCIPLINES[number]['id'];

export function disciplineLabel(id?: string | null) {
  return CREATIVE_DISCIPLINES.find((item) => item.id === id)?.label ?? 'Creative professional';
}
