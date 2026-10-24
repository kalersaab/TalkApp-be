import { Types } from 'mongoose';

import { InventoryModel } from '@models/inventory.model';
import { UserModel } from '@models/users.model';
import { getRedisService } from '@databases/redis';
import { HttpException } from '@exceptions/HttpException';
import { ITEMS_CATALOGUE, CATALOGUE_MAP, DEFAULT_ITEM_IDS } from '@constants/itemsCatalogue';
import type { InventoryResponse, OwnedItem, CatalogueItemWithOwnership, EquipResult, SenderEquipped } from '@interfaces/showcase.interface';
import type { IInventory, ItemType } from '@interfaces/users.interface';
import { logger } from '@utils/logger';

const INVENTORY_TTL = 10 * 60;
const CATALOGUE_TTL = 60 * 60;
const CATALOGUE_KEY = 'talkapp:showcase:catalogue';
const inventoryKey = (userId: string) => `talkapp:showcase:inventory:${userId}`;
const profileKey = (userId: string) => `profile:full:${userId}`;

export class ShowcaseService {
  async getInventory(userId: string): Promise<InventoryResponse> {
    const redis = getRedisService();
    const cacheKey = inventoryKey(userId);

    try {
      const cached = await redis.getTranslation(cacheKey);
      if (cached) return JSON.parse(cached) as InventoryResponse;
    } catch {}

    const inv = await InventoryModel.findOne({ userId: new Types.ObjectId(userId) }).lean<IInventory>();

    const ownedIds = new Set(inv?.items.map(i => i.itemId) ?? []);
    DEFAULT_ITEM_IDS.forEach(id => ownedIds.add(id));

    const allOwned: OwnedItem[] = [
      ...ITEMS_CATALOGUE.filter(c => c.unlockedByAchievement === null).map(c => ({
        itemId: c.id,
        itemType: c.type,
        unlockedAt: new Date(0),
        catalogueDetails: c,
      })),

      ...(inv?.items ?? [])
        .filter(i => !DEFAULT_ITEM_IDS.has(i.itemId))
        .map(i => ({
          itemId: i.itemId,
          itemType: i.itemType,
          unlockedAt: i.unlockedAt,
          catalogueDetails: CATALOGUE_MAP.get(i.itemId) ?? null,
        })),
    ];

    const response: InventoryResponse = {
      avatarEffects: allOwned.filter(i => i.itemType === 'avatarEffect'),
      chatBubbles: allOwned.filter(i => i.itemType === 'chatBubble'),
      chatBackgrounds: allOwned.filter(i => i.itemType === 'chatBackground'),
      equippedItems: {
        avatarEffectId: inv?.equippedItems.avatarEffectId ?? null,
        chatBubbleId: inv?.equippedItems.chatBubbleId ?? null,
        chatBackgroundId: inv?.equippedItems.chatBackgroundId ?? null,
      },
    };

    await redis.cacheTranslation(cacheKey, JSON.stringify(response), INVENTORY_TTL).catch(() => null);

    return response;
  }

  async getFullCatalogue(userId: string): Promise<CatalogueItemWithOwnership[]> {
    const redis = getRedisService();

    let catalogueBase: typeof ITEMS_CATALOGUE = ITEMS_CATALOGUE;
    try {
      const cached = await redis.getTranslation(CATALOGUE_KEY);
      if (cached) catalogueBase = JSON.parse(cached) as typeof ITEMS_CATALOGUE;
      else {
        await redis.cacheTranslation(CATALOGUE_KEY, JSON.stringify(ITEMS_CATALOGUE), CATALOGUE_TTL);
      }
    } catch {}

    const inv = await InventoryModel.findOne({ userId: new Types.ObjectId(userId) })
      .select('items')
      .lean<Pick<IInventory, 'items'>>();

    const ownedIds = new Set([...DEFAULT_ITEM_IDS, ...(inv?.items.map(i => i.itemId) ?? [])]);

    return catalogueBase.map(item => ({
      ...item,
      isOwned: ownedIds.has(item.id),
      unlockedBy: item.unlockedByAchievement,
    }));
  }

  async getCatalogueItem(itemId: string, userId: string): Promise<CatalogueItemWithOwnership> {
    const item = CATALOGUE_MAP.get(itemId);
    if (!item) throw new HttpException(404, `Item '${itemId}' not found in catalogue`);

    const inv = await InventoryModel.findOne({ userId: new Types.ObjectId(userId) })
      .select('items')
      .lean<Pick<IInventory, 'items'>>();

    const ownedIds = new Set([...DEFAULT_ITEM_IDS, ...(inv?.items.map(i => i.itemId) ?? [])]);

    return { ...item, isOwned: ownedIds.has(item.id), unlockedBy: item.unlockedByAchievement };
  }

  async equipItem(userId: string, itemId: string, itemType: ItemType): Promise<EquipResult> {
    const catalogueItem = CATALOGUE_MAP.get(itemId);
    if (!catalogueItem) throw new HttpException(404, `Item '${itemId}' not found`);
    if (catalogueItem.type !== itemType) {
      throw new HttpException(400, `Item '${itemId}' is not of type '${itemType}'`);
    }

    if (!DEFAULT_ITEM_IDS.has(itemId)) {
      const inv = await InventoryModel.findOne({ userId: new Types.ObjectId(userId) }).lean<IInventory>();
      const owns = inv?.items.some(i => i.itemId === itemId) ?? false;
      if (!owns) throw new HttpException(403, 'Item not owned');
    }

    const fieldMap: Record<ItemType, string> = {
      avatarEffect: 'equippedItems.avatarEffectId',
      chatBubble: 'equippedItems.chatBubbleId',
      chatBackground: 'equippedItems.chatBackgroundId',
    };

    const updated = await InventoryModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { $set: { [fieldMap[itemType]]: itemId } },
      { new: true, upsert: true },
    ).lean<IInventory>();

    const userFieldMap: Record<ItemType, string> = {
      avatarEffect: 'equippedItems.avatarEffect',
      chatBubble: 'equippedItems.chatBubble',
      chatBackground: 'equippedItems.chatBackground',
    };
    await UserModel.updateOne({ _id: new Types.ObjectId(userId) }, { $set: { [userFieldMap[itemType]]: itemId } });

    const redis = getRedisService();
    await Promise.all([
      redis.invalidateInventory(userId).catch(() => null),
      redis.cacheTranslation(inventoryKey(userId), '', 1).catch(() => null),
      redis.invalidateProfile(profileKey(userId)).catch(() => null),
    ]);

    logger.info(`[ShowcaseService] user ${userId} equipped ${itemType}=${itemId}`);

    return {
      equippedItems: {
        avatarEffectId: updated?.equippedItems.avatarEffectId ?? null,
        chatBubbleId: updated?.equippedItems.chatBubbleId ?? null,
        chatBackgroundId: updated?.equippedItems.chatBackgroundId ?? null,
      },
    };
  }

  async addItemToInventory(userId: string, itemId: string, itemType: ItemType): Promise<void> {
    await InventoryModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      {
        $addToSet: { items: { itemId, itemType, unlockedAt: new Date() } },
      },
      { upsert: true },
    );

    const inv = await InventoryModel.findOne({ userId: new Types.ObjectId(userId) })
      .select('items')
      .lean<Pick<IInventory, 'items'>>();

    await InventoryModel.updateOne({ userId: new Types.ObjectId(userId) }, { $set: { itemCount: inv?.items.length ?? 0 } });

    const redis = getRedisService();
    await redis.invalidateInventory(userId).catch(() => null);
    await redis.cacheTranslation(inventoryKey(userId), '', 1).catch(() => null);

    logger.info(`[ShowcaseService] added ${itemType}=${itemId} to inventory for user ${userId}`);
  }

  async getSenderEquipped(userId: string): Promise<SenderEquipped> {
    const redis = getRedisService();
    const cacheKey = inventoryKey(userId);

    try {
      const cached = await redis.getTranslation(cacheKey);
      if (cached) {
        const inv = JSON.parse(cached) as InventoryResponse;
        return {
          chatBubble: inv.equippedItems.chatBubbleId,
          chatBackground: inv.equippedItems.chatBackgroundId,
        };
      }
    } catch {}

    const inv = await InventoryModel.findOne({ userId: new Types.ObjectId(userId) })
      .select('equippedItems')
      .lean<Pick<IInventory, 'equippedItems'>>();

    return {
      chatBubble: inv?.equippedItems.chatBubbleId ?? null,
      chatBackground: inv?.equippedItems.chatBackgroundId ?? null,
    };
  }
}
