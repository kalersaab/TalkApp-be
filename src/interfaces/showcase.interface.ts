import type { ItemType } from '@interfaces/users.interface';
import type { CatalogueItem } from '@constants/itemsCatalogue';

// ─── Inventory response ───────────────────────────────────────────────────────

export interface OwnedItem {
  itemId: string;
  itemType: ItemType;
  unlockedAt: Date;
  catalogueDetails: CatalogueItem | null;
}

export interface InventoryResponse {
  avatarEffects: OwnedItem[];
  chatBubbles: OwnedItem[];
  chatBackgrounds: OwnedItem[];
  equippedItems: {
    avatarEffectId: string | null;
    chatBubbleId: string | null;
    chatBackgroundId: string | null;
  };
}

// ─── Catalogue response ───────────────────────────────────────────────────────

export interface CatalogueItemWithOwnership extends CatalogueItem {
  isOwned: boolean;
  unlockedBy: string | null; // achievementType
}

// ─── Equip result ─────────────────────────────────────────────────────────────

export interface EquipResult {
  equippedItems: {
    avatarEffectId: string | null;
    chatBubbleId: string | null;
    chatBackgroundId: string | null;
  };
}

// ─── Sender equipped items (attached to chat messages) ───────────────────────

export interface SenderEquipped {
  chatBubble: string | null;    // itemId
  chatBackground: string | null; // itemId
}
