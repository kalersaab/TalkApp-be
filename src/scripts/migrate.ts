/**
 * Index migration script — safely creates all indexes in production.
 *
 * Safe because:
 *  - Uses `{ background: true }` (Mongo 4.x) / rolling builds (Mongo 5+)
 *  - Checks if index already exists before creating
 *  - Idempotent — safe to run multiple times
 *
 * Run with:  npx ts-node -r tsconfig-paths/register src/scripts/migrate.ts
 */

import mongoose from 'mongoose';

import { dbConnect, dbDisconnect } from '@databases';
import { logger } from '@utils/logger';

// ─── Migration definitions ────────────────────────────────────────────────────

interface IndexSpec {
  collection: string;
  key: Record<string, number | string>;
  options?: mongoose.IndexOptions & { name: string };
}

const INDEXES: IndexSpec[] = [
  // ── users ──────────────────────────────────────────────────────────────────
  { collection: 'users', key: { email: 1 },         options: { unique: true,  name: 'users_email_unique' } },
  { collection: 'users', key: { location: '2dsphere' }, options: { sparse: true, name: 'users_location_2dsphere' } },
  { collection: 'users', key: { nativeLang: 1 },    options: { name: 'users_nativeLang' } },
  { collection: 'users', key: { learningLangs: 1 }, options: { name: 'users_learningLangs' } },
  { collection: 'users', key: { isOnline: 1 },      options: { name: 'users_isOnline' } },
  { collection: 'users', key: { collectorRank: 1 }, options: { name: 'users_collectorRank' } },
  { collection: 'users', key: { createdAt: -1 },    options: { name: 'users_createdAt_desc' } },

  // ── conversations ──────────────────────────────────────────────────────────
  { collection: 'conversations', key: { participantIds: 1 },                        options: { name: 'conversations_participantIds' } },
  { collection: 'conversations', key: { 'participantIds.0': 1, 'participantIds.1': 1 }, options: { unique: true, sparse: true, name: 'conversations_pair_unique' } },
  { collection: 'conversations', key: { updatedAt: -1 },                            options: { name: 'conversations_updatedAt_desc' } },

  // ── follows ────────────────────────────────────────────────────────────────
  { collection: 'follows', key: { followerId: 1, followingId: 1 }, options: { unique: true, name: 'follows_pair_unique' } },
  { collection: 'follows', key: { followingId: 1 },                options: { name: 'follows_followingId' } },

  // ── posts ──────────────────────────────────────────────────────────────────
  { collection: 'posts', key: { userId: 1 },              options: { name: 'posts_userId' } },
  { collection: 'posts', key: { createdAt: -1 },          options: { name: 'posts_createdAt_desc' } },
  { collection: 'posts', key: { userId: 1, createdAt: -1 }, options: { name: 'posts_userId_createdAt' } },
  { collection: 'posts', key: { likedBy: 1 },             options: { sparse: true, name: 'posts_likedBy' } },

  // ── achievements ───────────────────────────────────────────────────────────
  { collection: 'achievements', key: { userId: 1, achievementType: 1 }, options: { unique: true, name: 'achievements_user_type_unique' } },
  { collection: 'achievements', key: { userId: 1, earnedAt: -1 },       options: { name: 'achievements_userId_earnedAt' } },
  { collection: 'achievements', key: { medalTier: 1 },                  options: { name: 'achievements_medalTier' } },

  // ── inventories ────────────────────────────────────────────────────────────
  { collection: 'inventories', key: { userId: 1 },        options: { unique: true, name: 'inventories_userId_unique' } },
  { collection: 'inventories', key: { collectorRank: 1 }, options: { name: 'inventories_collectorRank' } },

  // ── streaks ────────────────────────────────────────────────────────────────
  { collection: 'streaks', key: { userId: 1 },          options: { unique: true, name: 'streaks_userId_unique' } },
  { collection: 'streaks', key: { currentStreak: -1 },  options: { name: 'streaks_currentStreak_desc' } },

  // ── otps ───────────────────────────────────────────────────────────────────
  { collection: 'otps', key: { email: 1 },       options: { name: 'otps_email' } },
  { collection: 'otps', key: { otpExpires: 1 },  options: { expireAfterSeconds: 0, name: 'otps_ttl' } }, // TTL index
];

// ─── Runner ───────────────────────────────────────────────────────────────────

async function migrate(): Promise<void> {
  await dbConnect();
  logger.info('[Migrate] Connected to MongoDB');

  const db = mongoose.connection.db;
  if (!db) throw new Error('No database connection');

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const spec of INDEXES) {
    const collection = db.collection(spec.collection);

    try {
      // Check if index already exists by name
      const existingIndexes = await collection.listIndexes().toArray();
      const alreadyExists = existingIndexes.some(idx => idx.name === spec.options?.name);

      if (alreadyExists) {
        logger.info(`[Migrate] SKIP  ${spec.collection} → ${spec.options?.name} (already exists)`);
        skipped++;
        continue;
      }

      await collection.createIndex(spec.key, {
        ...spec.options,
        // background: true is deprecated in Mongo 5+ but harmless; rolling index builds
        // are the default in replica sets from Mongo 4.4+
      });

      logger.info(`[Migrate] CREATE ${spec.collection} → ${spec.options?.name}`);
      created++;
    } catch (err) {
      logger.error(`[Migrate] FAIL  ${spec.collection} → ${spec.options?.name}: ${(err as Error).message}`);
      failed++;
    }
  }

  logger.info(`[Migrate] ✅ Done — created: ${created}, skipped: ${skipped}, failed: ${failed}`);

  if (failed > 0) {
    logger.warn('[Migrate] Some indexes failed. Review errors above before deploying.');
    await dbDisconnect();
    process.exit(1);
  }

  await dbDisconnect();
}

migrate().catch(err => {
  logger.error('[Migrate] Unexpected error:', err);
  void mongoose.disconnect();
  process.exit(1);
});
