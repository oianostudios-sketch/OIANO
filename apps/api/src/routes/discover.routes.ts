import { Prisma } from '@prisma/client';
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

    // Rank every other artist with a passport, across the whole network, in the database.
    // It used to score only the first 50 rows the database happened to return, in no order,
    // so once the network passed 50 artists most of them could never be found, however well
    // they matched (C39). The score is unchanged: shared genres count 3, shared themes 2,
    // and a complementary vocal role 1. Ties go to completed sessions, work other people took
    // part in, never to how much of a profile is filled in (C18); then the id, so the order is
    // stable.
    const genres = (path: string) => Prisma.sql`(SELECT count(*) FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p.creative_dna -> ${path}) = 'array' THEN p.creative_dna -> ${path} ELSE '[]'::jsonb END
    ) AS item WHERE item = ANY(${path === 'genres' ? myGenres : myThemes}::text[]))`;
    const ranked = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT a.id
      FROM artists a
      JOIN artist_passports p ON p.artist_id = a.id
      WHERE a.id <> ${callerArtistId ?? ''}
      ORDER BY
        3 * ${genres('genres')} + 2 * ${genres('key_themes')}
          + CASE WHEN ${myRole} <> '' AND COALESCE(p.creative_dna ->> 'vocal_type', '') NOT IN ('', ${myRole}) THEN 1 ELSE 0 END DESC,
        (SELECT count(*) FROM bookings b WHERE b.artist_id = a.id AND b.status = 'COMPLETED') DESC,
        a.id ASC
      LIMIT 20
    `;
    const order = ranked.map((row) => row.id);
    const artists = await prisma.artist.findMany({
      where: { id: { in: order } },
      select: {
        id: true, name: true, alias: true,
        passport: { select: { bio: true, creative_dna: true, profile_image_url: true, profile_strength: true } },
      },
    });
    const byId = new Map(artists.map((a) => [a.id, a]));

    const top = order.flatMap((id) => {
      const a = byId.get(id);
      if (!a) return [];
      const dna    = (a.passport?.creative_dna as any) ?? {};
      const theirGenres: string[] = Array.isArray(dna.genres) ? dna.genres : [];
      const theirThemes: string[] = Array.isArray(dna.key_themes) ? dna.key_themes : [];
      const role: string = dna.vocal_type ?? '';
      const shared_genres = theirGenres.filter((g) => myGenres.includes(g));
      const shared_themes = theirThemes.filter((t) => myThemes.includes(t));
      return [{
        id:     a.id,
        name:   a.name,
        alias:  a.alias,
        bio:    a.passport?.bio ?? null,
        avatar: a.passport?.profile_image_url ?? null,
        // Still returned for the profile prompt; it ranks no one.
        profile_strength: a.passport?.profile_strength ?? 0,
        creative_dna: dna,
        overlap_score: shared_genres.length * 3 + shared_themes.length * 2 + (role && myRole && role !== myRole ? 1 : 0),
        shared_genres,
        shared_themes,
      }];
    });

    const tiers = await computeArtistTiers(top.map((a) => a.id));
    const withTier = top.map((a) => ({ ...a, tier: tiers[a.id] ?? null }));

    res.json(withTier);
  } catch (err) { next(err); }
});
