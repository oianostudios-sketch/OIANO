// Whether the person viewing an artist profile is that artist.
//
// The profile page gives its owner controls that act on the signed-in account,
// not on the profile on screen: links to their own passport and to booking,
// editing the AI brief (PATCH /api/passport/summary writes the caller's own
// passport), and uploading or deleting files (the files routes refuse any other
// artist). Artists reach one another's profiles from Discover and Connect, so a
// check on role alone put those controls on every profile an artist opened, and
// saving the brief there replaced the viewer's own brief with one written about
// someone else.
//
// Ownership is the viewer being the profile's user. What studio staff may do is
// a separate rule, and the page states it separately.

export interface ProfileViewer {
  id?: string | null;
  role?: string | null;
}

export interface ViewedArtistProfile {
  user_id?: string | null;
}

export function isArtistProfileOwner(
  viewer: ProfileViewer | null | undefined,
  profile: ViewedArtistProfile | null | undefined,
): boolean {
  // The owner controls lead to artist-only routes (/artist/passport, /book).
  if (viewer?.role !== 'ARTIST') return false;
  // Two missing ids are not a match.
  if (!viewer.id || !profile?.user_id) return false;
  return profile.user_id === viewer.id;
}
