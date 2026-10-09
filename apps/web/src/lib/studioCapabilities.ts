// What the caller may do at their active studio, as the API decides it
// (apps/api/src/lib/staffPermission.ts): their membership holds the capability, or it is
// a STUDIO_ADMIN membership with no capabilities at all, the legacy owner. The web app
// only hides what the server would refuse; the server's refusal stays the real check.

export type StudioMembership = {
  studio: { id: string; name: string; slug: string; logo_url?: string | null };
  role: string;
  position: string;
  capabilities: string[];
};

export type MembershipResponse = {
  active_studio_id: string | null;
  memberships: StudioMembership[];
};

export function membershipHolds(membership: Pick<StudioMembership, 'role' | 'capabilities'> | null | undefined, capability: string): boolean {
  if (!membership) return false;
  return membership.capabilities.includes(capability)
    || (membership.capabilities.length === 0 && membership.role === 'STUDIO_ADMIN');
}

// The membership a staff request is scoped to. With no active studio chosen and more
// than one membership the server refuses until one is, so nothing is held.
export function activeMembership(data: MembershipResponse | null | undefined): StudioMembership | null {
  if (!data?.memberships.length) return null;
  const active = data.memberships.find(item => item.studio.id === data.active_studio_id);
  if (active) return active;
  return data.memberships.length === 1 ? data.memberships[0] : null;
}
