import type { UserRole } from './accountArchitecture';

// These are routes into today's product, not aliases for canonical NOW/MAKE/SKY/ME.
export function creatorNavigation(role?: UserRole) {
  if (role !== 'ARTIST' && role !== 'PRODUCER') return [];
  return [
    { label: 'Home', path: '/dashboard', matches: ['/dashboard'] },
    { label: 'Projects', path: role === 'ARTIST' ? '/projects' : '/producer', matches: role === 'ARTIST' ? ['/projects', '/book', '/bookings', '/calendar'] : ['/producer', '/producer/projects'] },
    { label: 'Contributions', path: '/contributions', matches: ['/contributions'] },
    { label: 'People', path: '/discover', matches: ['/discover', '/producers', '/artists', '/connect'] },
    { label: 'Passport', path: role === 'ARTIST' ? '/artist/passport' : '/producer/passport', matches: ['/artist/passport', '/producer/passport'] },
  ];
}

export function activeCreatorDestination(role: UserRole | undefined, pathname: string) {
  // Longest matching route wins: producer/passport must not activate Projects.
  return creatorNavigation(role).flatMap(item => item.matches.map(prefix => ({ item, prefix })))
    .filter(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.item.path;
}
