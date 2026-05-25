import type { ItemType } from '@interfaces/users.interface';

// ─── Catalogue item shape ─────────────────────────────────────────────────────

export interface CatalogueItem {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  unlockedByAchievement: string | null; // null = default item (everyone owns it)
  previewImageUrl: string;
}

// ─── Full catalogue ───────────────────────────────────────────────────────────

export const ITEMS_CATALOGUE: CatalogueItem[] = [
  // ── Avatar Effects ──────────────────────────────────────────────────────────
  {
    id: 'default_none',
    name: 'No Effect',
    type: 'avatarEffect',
    description: 'Default — no avatar effect.',
    unlockedByAchievement: null,
    previewImageUrl: '/assets/items/avatar_effects/default_none.png',
  },
  {
    id: 'flame_ring',
    name: 'Flame Ring',
    type: 'avatarEffect',
    description: 'A ring of fire around your avatar. Earned with a 7-day streak.',
    unlockedByAchievement: 'streak_7',
    previewImageUrl: '/assets/items/avatar_effects/flame_ring.png',
  },
  {
    id: 'gold_crown',
    name: 'Gold Crown',
    type: 'avatarEffect',
    description: 'A golden crown for popular users. Earned with 100 followers.',
    unlockedByAchievement: 'followers_100',
    previewImageUrl: '/assets/items/avatar_effects/gold_crown.png',
  },
  {
    id: 'star_burst',
    name: 'Star Burst',
    type: 'avatarEffect',
    description: 'Bursting stars around your avatar. Earned with a popular post.',
    unlockedByAchievement: 'post_popular',
    previewImageUrl: '/assets/items/avatar_effects/star_burst.png',
  },
  {
    id: 'legend_aura',
    name: 'Legend Aura',
    type: 'avatarEffect',
    description: 'A legendary aura for the most dedicated learners. Earned with a 100-day streak.',
    unlockedByAchievement: 'streak_100',
    previewImageUrl: '/assets/items/avatar_effects/legend_aura.png',
  },

  // ── Chat Bubbles ────────────────────────────────────────────────────────────
  {
    id: 'default_plain',
    name: 'Plain Bubble',
    type: 'chatBubble',
    description: 'Default plain chat bubble.',
    unlockedByAchievement: null,
    previewImageUrl: '/assets/items/chat_bubbles/default_plain.png',
  },
  {
    id: 'gold_bubble',
    name: 'Gold Bubble',
    type: 'chatBubble',
    description: 'A shimmering gold chat bubble. Earned with a 30-day streak.',
    unlockedByAchievement: 'streak_30',
    previewImageUrl: '/assets/items/chat_bubbles/gold_bubble.png',
  },
  {
    id: 'star_bubble',
    name: 'Star Bubble',
    type: 'chatBubble',
    description: 'A star-studded chat bubble. Earned with a popular post.',
    unlockedByAchievement: 'post_popular',
    previewImageUrl: '/assets/items/chat_bubbles/star_bubble.png',
  },
  {
    id: 'royal_bubble',
    name: 'Royal Bubble',
    type: 'chatBubble',
    description: 'A royal purple chat bubble. Earned with 100 followers.',
    unlockedByAchievement: 'followers_100',
    previewImageUrl: '/assets/items/chat_bubbles/royal_bubble.png',
  },

  // ── Chat Backgrounds ────────────────────────────────────────────────────────
  {
    id: 'default_white',
    name: 'White',
    type: 'chatBackground',
    description: 'Default white chat background.',
    unlockedByAchievement: null,
    previewImageUrl: '/assets/items/chat_backgrounds/default_white.png',
  },
  {
    id: 'world_map',
    name: 'World Map',
    type: 'chatBackground',
    description: 'A world map background for global learners. Earned by chatting with 10 partners.',
    unlockedByAchievement: 'partners_10',
    previewImageUrl: '/assets/items/chat_backgrounds/world_map.png',
  },
  {
    id: 'legend_bg',
    name: 'Legend',
    type: 'chatBackground',
    description: 'A legendary background for the most dedicated. Earned with a 100-day streak.',
    unlockedByAchievement: 'streak_100',
    previewImageUrl: '/assets/items/chat_backgrounds/legend_bg.png',
  },
  {
    id: 'galaxy_bg',
    name: 'Galaxy',
    type: 'chatBackground',
    description: 'A galaxy background for the most followed users. Earned with 1000 followers.',
    unlockedByAchievement: 'followers_1000',
    previewImageUrl: '/assets/items/chat_backgrounds/galaxy_bg.png',
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export const CATALOGUE_MAP = new Map(ITEMS_CATALOGUE.map(i => [i.id, i]));

/** IDs of items every user owns by default (no achievement required) */
export const DEFAULT_ITEM_IDS = new Set(
  ITEMS_CATALOGUE.filter(i => i.unlockedByAchievement === null).map(i => i.id),
);
