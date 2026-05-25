import { Schema, model } from 'mongoose';
import type { IInventory } from '@interfaces/users.interface';

const inventoryItemSchema = new Schema(
  {
    itemId: { type: String, required: true },
    itemType: { type: String, enum: ['avatarEffect', 'chatBubble', 'chatBackground'], required: true },
    unlockedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const inventorySchema = new Schema<IInventory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: { type: [inventoryItemSchema], default: [] },
    equippedItems: {
      avatarEffectId: { type: String, default: null },
      chatBubbleId: { type: String, default: null },
      chatBackgroundId: { type: String, default: null },
    },
    collectorRank: {
      type: String,
      enum: ['junior', 'collector', 'senior', 'elite', 'legendary'],
      default: 'junior',
    },
    itemCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: false, updatedAt: true } },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

inventorySchema.index({ userId: 1 }, { unique: true });
inventorySchema.index({ collectorRank: 1 });

export const InventoryModel = model<IInventory>('Inventory', inventorySchema);
export default InventoryModel;
