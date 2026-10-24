import type { Response, NextFunction } from 'express';

import type { RequestWithUser } from '@interfaces/auth.interface';
import { ShowcaseService } from '@services/showcase.service';
import type { EquipItemDto } from '@dtos/showcase.dto';

const svc = new ShowcaseService();

export const getInventory = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getInventory(req.user._id.toString());
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getCatalogue = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await svc.getFullCatalogue(req.user._id.toString());
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getCatalogueItem = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { itemId } = req.params as { itemId: string };
    const data = await svc.getCatalogueItem(itemId, req.user._id.toString());
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const equipItem = async (req: RequestWithUser, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { itemId, itemType } = req.body as EquipItemDto;
    const data = await svc.equipItem(req.user._id.toString(), itemId, itemType);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
