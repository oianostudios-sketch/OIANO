import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';
import { computeArtistTiers } from '../lib/artistTier';

export const discoverRouter = Router();
discoverRouter.use(authenticate);

// GET /api/artists/discover  — returns other artists ranked by creative DNA overlap
discoverRouter.get('/', async (req: any, res: Response, next: NextFunction) => {
  try {
    // Resolve caller's artist record from their user ID (auth middleware sets req.userId)
    const callerArtist = req.userId
      ? await prisma.artist.findUnique({ where: { user_id: req.userId }, select: { id: true } })
      : null;
    const callerArtistId = callerArtist?.id ?? null;

    // Fetch caller's own passport
    const myPassport = callerArtistId
      ? await prisma.artistPassport.findUnique({
          where: { artist_id: callerArtistId },
          select: { creative_dna: true },
        })
      : null;

    const myDNA = (myPassport?.creative_dna as any) ?? {};
    const myGenres: string[]  = myDNA.genres ?? [];
    const myThemes: string[]  = myDNA.key_themes ?? [];
    const myRole: string      = myDNA.vocal_type ?? '';

    // All other artists with a passport. Artist has no direct studio relation
    // in the schema (Studio scoping only exists on Room/Booking/etc.) — in
    // SINGLE_STUDIO_MODE every artist implicitly belongs to the one studio,
    // so no studio filter is needed here.
    const artists = await prisma.artist.findMany({
      where: {
        id:     { not: callerArtistId ?? '__none__' },
        passport: { isNot: null },
      },
      select: {
        id:    true,
        name:  true,
        alias: true,
        passport: {
          select: {
            bio:          true,
            creative_dna: true,
            profile_image_url: true,
            profile_strength: true,
          },
        },
      },
      take: 50,
    });

    // Compute overlap score
    const scored = artists.map((a) => {
      const dna    = (a.passport?.creative_dna as any) ?? {};
      const genres: string[] = dna.genres ?? [];
      const themes: string[] = dna.key_themes ?? [];
      const role: string     = dna.vocal_type ?? '';

      const genreOverlap = genres.filter((g) => myGenres.includes(g)).length;
      const themeOverlap = themes.filter((t) => myThemes.includes(t)).length;
      const roleMatch    = role && myRole && role !== myRole ? 1 : 0; // complementary roles score higher

      const score = genreOverlap * 3 + themeOverlap * 2 + roleMatch;
      return {
        id:     a.id,
        name:   a.name,
        alias:  a.alias,
        bio:    a.passport?.bio ?? null,
        avatar: a.passport?.profile_image_url ?? null,
        profile_strength: a.passport?.profile_strength ?? 0,
        creative_dna: dna,
        overlap_score: score,
        shared_genres: genres.filter((g) => myGenres.includes(g)),
        shared_themes: themes.filter((t) => myThemes.includes(t)),
      };
    });

    // Sort by overlap desc, then by profile_strength
    scored.sort((a, b) =>
      b.overlap_score - a.overlap_score || b.profile_strength - a.profile_strength
    );

    const top = scored.slice(0, 20);
    const tiers = await computeArtistTiers(top.map((a) => a.id));
    const withTier = top.map((a) => ({ ...a, tier: tiers[a.id] ?? null }));

    res.json(withTier);
  } catch (err) { next(err); }
});
