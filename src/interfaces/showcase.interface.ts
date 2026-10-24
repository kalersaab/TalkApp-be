import type { ItemType } from '@interfaces/users.interface';
import type { CatalogueItem } from '@constants/itemsCatalogue';

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

export interface CatalogueItemWithOwnership extends CatalogueItem {
  isOwned: boolean;
  unlockedBy: string | null;
}

export interface EquipResult {
  equippedItems: {
    avatarEffectId: string | null;
    chatBubbleId: string | null;
    chatBackgroundId: string | null;
  };
}

export interface SenderEquipped {
  chatBubble: string | null;
  chatBackground: string | null;
}
