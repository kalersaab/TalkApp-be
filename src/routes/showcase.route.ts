import { Router } from 'express';

import { EquipItemDto } from '@dtos/showcase.dto';
import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import validationMiddleware from '@middlewares/validation.middleware';
import {
  getInventory,
  getCatalogue,
  getCatalogueItem,
  equipItem,
} from '@controllers/showcase.controller';

export class ShowcaseRoute implements Routes {
  public path = '/showcase';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(AuthMiddleware);

    // GET /api/showcase/inventory
    this.router.get(`${this.path}/inventory`, getInventory);

    // GET /api/showcase/catalogue
    this.router.get(`${this.path}/catalogue`, getCatalogue);

    // GET /api/showcase/catalogue/:itemId
    this.router.get(`${this.path}/catalogue/:itemId`, getCatalogueItem);

    // POST /api/showcase/equip
    this.router.post(
      `${this.path}/equip`,
      validationMiddleware(EquipItemDto, 'body'),
      equipItem,
    );
  }
}
