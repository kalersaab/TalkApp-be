/**
 * Seeds partners + chat/social data around an existing user.
 * Does NOT wipe that user.
 *
 * Run:  npm run seed:user
 */

import { hash } from 'bcrypt';
import mongoose, { Types } from 'mongoose';

import { dbConnect, dbDisconnect } from '@databases';
import { UserModel } from '@models/users.model';
import { ConversationModel } from '@models/conversation.model';
import { GroupConversationModel } from '@models/groupConversation.model';
import { FollowModel } from '@models/follow.model';
import { PostModel } from '@models/post.model';
import { AchievementModel } from '@models/achievement.model';
import { InventoryModel } from '@models/inventory.model';
import { StreakModel } from '@models/streak.model';
import { MatchPreferenceModel } from '@models/matchPreference.model';
import { MatchEventModel } from '@models/matchEvent.model';
import UserProfileModel from '@models/userProfile.model';
import { logger } from '@utils/logger';

const TARGET_USER_ID = '6ad320e86975e8a70aed3d7c';
const SEED_EMAIL_SUFFIX = '@talkapp.dev';
const daysAgo = (n: number): Date => new Date(Date.now() - n * 86_400_000);

const PARTNERS = [
  {
    displayName: 'Ana Kovac',
    username: 'ta@ana.hr',
    email: `seed.partner1${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Croatian',
    learningLangs: ['Hindi', 'Punjabi'],
    proficiencyLevels: { Hindi: 'intermediate', Punjabi: 'beginner' },
    gender: 'female' as const,
    bio: 'Native Croatian speaker. Happy to swap Hindi practice!',
    city: 'Zagreb',
  },
  {
    displayName: 'Harpreet Singh',
    username: 'ta@harpreet.pb',
    email: `seed.partner2${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Punjabi',
    learningLangs: ['Hindi', 'Tamil'],
    proficiencyLevels: { Hindi: 'advanced', Tamil: 'beginner' },
    gender: 'male' as const,
    bio: 'Punjabi native. Looking for daily conversation partners.',
    city: 'Amritsar',
  },
  {
    displayName: 'Meena Iyer',
    username: 'ta@meena.ta',
    email: `seed.partner3${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Tamil',
    learningLangs: ['Hindi'],
    proficiencyLevels: { Hindi: 'intermediate' },
    gender: 'female' as const,
    bio: 'Tamil speaker learning Hindi. Let’s chat!',
    city: 'Chennai',
  },
  {
    displayName: 'Rohit Sharma',
    username: 'ta@rohit.hi',
    email: `seed.partner4${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Hindi',
    learningLangs: ['Croatian', 'Tamil'],
    proficiencyLevels: { Croatian: 'beginner', Tamil: 'intermediate' },
    gender: 'male' as const,
    bio: 'Hindi speaker practicing Croatian and Tamil.',
    city: 'Delhi',
  },
  {
    displayName: 'Ivana Petrovic',
    username: 'ta@ivana.hr',
    email: `seed.partner5${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Croatian',
    learningLangs: ['Hindi'],
    proficiencyLevels: { Hindi: 'beginner' },
    gender: 'female' as const,
    bio: 'Beginner Hindi — slow conversations welcome.',
    city: 'Split',
  },
  {
    displayName: 'Simran Kaur',
    username: 'ta@simran.pb',
    email: `seed.partner6${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Punjabi',
    learningLangs: ['Hindi', 'Croatian'],
    proficiencyLevels: { Hindi: 'intermediate', Croatian: 'beginner' },
    gender: 'female' as const,
    bio: 'Punjabi + Hindi. Curious about Croatian.',
    city: 'Ludhiana',
  },
  {
    displayName: 'Karthik Raman',
    username: 'ta@karthik.ta',
    email: `seed.partner7${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Tamil',
    learningLangs: ['Hindi', 'Punjabi'],
    proficiencyLevels: { Hindi: 'advanced', Punjabi: 'beginner' },
    gender: 'male' as const,
    bio: 'Tamil native, fluent-ish Hindi. Let’s practice.',
    city: 'Madurai',
  },
  {
    displayName: 'Online Now User',
    username: 'ta@online.now',
    email: `seed.partner8${SEED_EMAIL_SUFFIX}`,
    nativeLang: 'Hindi',
    learningLangs: ['Croatian', 'Punjabi', 'Tamil'],
    proficiencyLevels: { Croatian: 'intermediate', Punjabi: 'intermediate', Tamil: 'beginner' },
    gender: 'other' as const,
    bio: 'Always online for a quick language swap.',
    city: 'Mumbai',
    isOnline: true,
  },
];

function sortPair(a: Types.ObjectId, b: Types.ObjectId): Types.ObjectId[] {
  return [a, b].sort((x, y) => x.toString().localeCompare(y.toString()));
}

async function seed(): Promise<void> {
  await dbConnect();
  logger.info('[SeedUser] Connected');

  const targetId = new Types.ObjectId(TARGET_USER_ID);
  const target = await UserModel.findById(targetId);
  if (!target) {
    throw new Error(`User ${TARGET_USER_ID} not found. Log in with Google first, then re-run.`);
  }

  logger.info(`[SeedUser] Target: ${target.displayName} <${target.email}>`);

  const existingPartners = await UserModel.find({ email: { $regex: /^seed\.partner\d+@talkapp\.dev$/ } }).select('_id');
  const existingPartnerIds = existingPartners.map(u => u._id);

  if (existingPartnerIds.length) {
    await Promise.all([
      FollowModel.deleteMany({ $or: [{ followerId: { $in: existingPartnerIds } }, { followingId: { $in: existingPartnerIds } }] }),
      ConversationModel.deleteMany({ participantIds: { $in: existingPartnerIds } }),
      GroupConversationModel.deleteMany({ 'members.userId': { $in: existingPartnerIds } }),
      PostModel.deleteMany({ userId: { $in: existingPartnerIds } }),
      AchievementModel.deleteMany({ userId: { $in: existingPartnerIds } }),
      InventoryModel.deleteMany({ userId: { $in: existingPartnerIds } }),
      StreakModel.deleteMany({ userId: { $in: existingPartnerIds } }),
      MatchPreferenceModel.deleteMany({ userId: { $in: existingPartnerIds } }),
      MatchEventModel.deleteMany({ $or: [{ userId: { $in: existingPartnerIds } }, { partnerId: { $in: existingPartnerIds } }] }),
      UserProfileModel.deleteMany({ userId: { $in: existingPartnerIds } }),
      UserModel.deleteMany({ _id: { $in: existingPartnerIds } }),
    ]);
    logger.info(`[SeedUser] Removed ${existingPartnerIds.length} previous seed partners`);
  }

  const passwordHash = await hash('Password123!', 10);

  const partnerDocs = PARTNERS.map((p, i) => ({
    displayName: p.displayName,
    username: p.username,
    email: p.email,
    passwordHash,
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=partner${i + 1}`,
    provider: 'local' as const,
    role: 'user' as const,
    isVerified: true,
    isActive: true,
    nativeLang: p.nativeLang,
    learningLangs: p.learningLangs,
    proficiencyLevels: new Map(Object.entries(p.proficiencyLevels)),
    gender: p.gender,
    dateOfBirth: new Date(1992 + (i % 8), i % 12, 8 + i),
    location: {
      type: 'Point' as const,
      coordinates: [77.209 + i * 0.02, 28.6139 + i * 0.015] as [number, number],
    },
    bio: p.bio,
    daysJoined: 12 + i,
    joinedAt: daysAgo(20 + i),
    currentStreak: 3 + i,
    longestStreak: 10 + i,
    lastActiveDate: daysAgo(i === 7 ? 0 : i % 2),
    followingCount: 0,
    followersCount: 0,
    totalMedalCount: i,
    collectorRank: i > 5 ? ('collector' as const) : ('junior' as const),
    equippedItems: {
      avatarEffect: null,
      chatBubble: null,
      chatBackground: null,
    },
    isOnline: Boolean(p.isOnline),
    lastSeen: p.isOnline ? new Date() : daysAgo(i % 3),
  }));

  const partners = await UserModel.insertMany(partnerDocs);
  logger.info(`[SeedUser] Created ${partners.length} partners`);

  await UserModel.updateOne(
    { _id: targetId },
    {
      $set: {
        proficiencyLevels: new Map(
          Object.entries({
            Croatian: 'beginner',
            Punjabi: 'intermediate',
            Tamil: 'beginner',
          }),
        ),
        bio: target.bio || 'Hindi speaker learning Croatian, Punjabi, and Tamil.',
        daysJoined: target.daysJoined || 4,
        currentStreak: 5,
        longestStreak: 12,
        lastActiveDate: new Date(),
        location: {
          type: 'Point',
          coordinates: target.location?.coordinates?.length === 2 ? target.location.coordinates : [77.209, 28.6139],
        },
        followingCount: 5,
        followersCount: 6,
      },
    },
  );

  await StreakModel.findOneAndUpdate(
    { userId: targetId },
    { $set: { currentStreak: 5, longestStreak: 12, lastActiveDate: new Date() } },
    { upsert: true },
  );

  await InventoryModel.findOneAndUpdate(
    { userId: targetId },
    {
      $set: {
        items: [
          { itemId: 'bubble_wave', itemType: 'chatBubble', unlockedAt: daysAgo(3) },
          { itemId: 'fx_sparkle', itemType: 'avatarEffect', unlockedAt: daysAgo(2) },
        ],
        equippedItems: { avatarEffectId: 'fx_sparkle', chatBubbleId: 'bubble_wave', chatBackgroundId: null },
        collectorRank: 'junior',
        itemCount: 2,
      },
    },
    { upsert: true },
  );

  await UserProfileModel.findOneAndUpdate(
    { userId: targetId },
    {
      $set: {
        interests: ['languages', 'travel', 'music', 'cricket'],
        placesToGo: ['Zagreb', 'Chennai', 'Amritsar'],
        hometown: 'India',
        currentLocation: { city: 'Delhi', country: 'India', showInProfile: true },
        occupation: ['Student'],
        birthday: new Date(1998, 5, 14),
        mbtiType: 'ENFP',
        showRegionInProfile: true,
        profilePictures: target.avatarUrl
          ? [{ url: target.avatarUrl, isPrimary: true, uploadedAt: new Date() }]
          : [],
        isComplete: true,
        completionPercentage: 85,
        lastUpdatedAt: new Date(),
      },
    },
    { upsert: true },
  );

  await MatchPreferenceModel.findOneAndUpdate(
    { userId: targetId },
    {
      $set: {
        genderPreference: 'any',
        learningLanguages: ['Croatian', 'Punjabi', 'Tamil'],
        nativeLanguage: 'Hindi',
        ageRange: { min: 18, max: 40 },
        enableNearby: true,
        proximityKm: 80,
        proficiencyLevel: 'any',
      },
    },
    { upsert: true },
  );

  const partnerStreaks = partners.map((u, i) => ({
    userId: u._id,
    currentStreak: 3 + i,
    longestStreak: 10 + i,
    lastActiveDate: u.lastActiveDate ?? new Date(),
  }));
  await StreakModel.insertMany(partnerStreaks);

  const partnerInventories = partners.map(u => ({
    userId: u._id,
    items: [],
    equippedItems: { avatarEffectId: null, chatBubbleId: null, chatBackgroundId: null },
    collectorRank: u.collectorRank,
    itemCount: 0,
  }));
  await InventoryModel.insertMany(partnerInventories);

  await AchievementModel.deleteMany({ userId: targetId });
  await AchievementModel.insertMany([
    { userId: targetId, achievementType: 'first_message', medalTier: 'bronze', earnedAt: daysAgo(3) },
    { userId: targetId, achievementType: 'streak_7', medalTier: 'silver', earnedAt: daysAgo(1) },
    { userId: targetId, achievementType: 'polyglot', medalTier: 'gold', earnedAt: daysAgo(0) },
  ]);

  const mutualPartners = partners.slice(0, 5);
  const followerOnly = partners.slice(5, 7);
  const followDocs: object[] = [];

  for (const p of mutualPartners) {
    followDocs.push({ followerId: targetId, followingId: p._id, isMutual: true });
    followDocs.push({ followerId: p._id, followingId: targetId, isMutual: true });
  }
  for (const p of followerOnly) {
    followDocs.push({ followerId: p._id, followingId: targetId, isMutual: false });
  }
  await FollowModel.insertMany(followDocs);
  logger.info(`[SeedUser] Created ${followDocs.length} follow records`);

  const greetings = [
    'Hey Tgg! Want to practice Croatian today?',
    'Sat sri akal — ready for some Punjabi?',
    'Vanakkam! Slow Tamil conversation?',
    'Hindi-Croatian swap after dinner?',
    'I can help with beginner Croatian 👋',
  ];

  const convDocs = partners.slice(0, 5).map((p, i) => {
    const participantIds = sortPair(targetId, p._id);
    const fromPartner = i % 2 === 0;
    return {
      participantIds,
      lastMessage: {
        text: greetings[i],
        senderId: fromPartner ? p._id : targetId,
        timestamp: daysAgo(i),
      },
      isMutualFriends: i < 3,
      unreadCounts: {
        [targetId.toString()]: fromPartner ? 2 : 0,
        [p._id.toString()]: fromPartner ? 0 : 1,
      },
    };
  });
  const conversations = await ConversationModel.insertMany(convDocs);
  logger.info(`[SeedUser] Created ${conversations.length} conversations`);

  const group = await GroupConversationModel.create({
    name: 'Hindi ↔ Balkan / South India',
    description: 'Practice group seeded for Tgg',
    members: [{ userId: targetId, role: 'admin', joinedAt: daysAgo(4) }, ...partners.slice(0, 4).map(p => ({ userId: p._id, role: 'member', joinedAt: daysAgo(3) }))],
    createdBy: targetId,
    lastMessage: {
      text: 'Welcome everyone — drop a voice note in your native language!',
      senderId: partners[0]._id,
      timestamp: new Date(),
    },
    settings: { onlyAdminsCanPost: false, approvalRequired: false, isPrivate: false },
  });

  await PostModel.deleteMany({ userId: targetId, content: { $regex: /^\[seed\]/ } });
  await PostModel.insertMany([
    {
      userId: targetId,
      content: '[seed] Day 5 learning Croatian. Any easy greetings besides bok?',
      postType: 'text',
      likeCount: 3,
      likedBy: partners.slice(0, 3).map(p => p._id),
      createdAt: daysAgo(1),
    },
    {
      userId: targetId,
      content: '[seed] Looking for a Tamil tandem tonight.',
      mediaUrl: 'https://picsum.photos/seed/tgg/600/400',
      postType: 'image',
      likeCount: 2,
      likedBy: partners.slice(2, 4).map(p => p._id),
      createdAt: daysAgo(0),
    },
    ...partners.slice(0, 4).map((p, i) => ({
      userId: p._id,
      content: `[seed] ${p.displayName} here — native ${p.nativeLang}. DM me!`,
      postType: 'text' as const,
      likeCount: 1,
      likedBy: [targetId],
      createdAt: daysAgo(i),
    })),
  ]);

  await MatchEventModel.insertMany(
    partners.slice(0, 6).map((p, i) => ({
      userId: targetId,
      partnerId: p._id,
      score: 0.92 - i * 0.07,
      source: 'language' as const,
    })),
  );

  logger.info('[SeedUser] ✅ Done');
  logger.info(`[SeedUser] Your userId: ${TARGET_USER_ID}`);
  logger.info('[SeedUser] Chat with these targetUserIds:');
  partners.forEach((p, i) => {
    logger.info(`  ${i + 1}. ${p.displayName}  _id=${p._id.toString()}  email=${p.email}`);
  });
  logger.info(`[SeedUser] Group id: ${group._id.toString()}`);
  logger.info('[SeedUser] Partner login (local): Password123!');

  await dbDisconnect();
}

seed().catch(err => {
  logger.error('[SeedUser] Failed:', err);
  void mongoose.disconnect();
  process.exit(1);
});
