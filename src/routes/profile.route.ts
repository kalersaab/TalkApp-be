import { Router } from 'express';

import type { Routes } from '@interfaces/routes.interface';
import { AuthMiddleware } from '@middlewares/auth.middleware';
import { avatarUpload } from '@middlewares/upload';
import validationMiddleware from '@middlewares/validation.middleware';
import { CompleteProfileDto, UpdateProfileDto } from '@dtos/profile.dto';
import {
  getProfile,
  getMyProfile,
  updateProfile,
  uploadAvatar,
  getProfilePosts,
  getFollowers,
  getFollowing,
  getAchievements,
  followUser,
  unfollowUser,
  likePost,
  unlikePost,
  completeProfile,
} from '@controllers/profile.controller';

export class ProfileRoute implements Routes {
  public path = '/profile';
  public router = Router();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.router.use(AuthMiddleware);

    // ── Profile onboarding (for new Google Sign-In users) ───────────────────
    this.router.post(`${this.path}/complete`, validationMiddleware(CompleteProfileDto, 'body'), completeProfile);

    // ── Own profile ──────────────────────────────────────────────────────────
    this.router.get(`${this.path}/me`, getMyProfile);
    this.router.patch(`${this.path}/me`, validationMiddleware(UpdateProfileDto, 'body', true), updateProfile);
    this.router.post(`${this.path}/me/avatar`, avatarUpload, uploadAvatar);

    // ── Any user's profile ───────────────────────────────────────────────────
    this.router.get(`${this.path}/:userId`, getProfile);
    this.router.get(`${this.path}/:userId/posts`, getProfilePosts);
    this.router.get(`${this.path}/:userId/followers`, getFollowers);
    this.router.get(`${this.path}/:userId/following`, getFollowing);
    this.router.get(`${this.path}/:userId/achievements`, getAchievements);

    // ── Follow / unfollow ────────────────────────────────────────────────────
    this.router.post(`${this.path}/:userId/follow`, followUser);
    this.router.delete(`${this.path}/:userId/follow`, unfollowUser);

    // ── Post likes ───────────────────────────────────────────────────────────
    this.router.post(`${this.path}/posts/:postId/like`, likePost);
    this.router.delete(`${this.path}/posts/:postId/like`, unlikePost);
  }
}
