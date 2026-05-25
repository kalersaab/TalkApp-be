import type { Response, NextFunction } from 'express';
import type { File as MulterFile } from 'multer';

import type { RequestWithUser } from '@interfaces/auth.interface';
import { ProfileService } from '@services/profile.service';

// Multer adds `file` to the request — extend locally
type RequestWithFile = RequestWithUser & { file?: MulterFile };

const svc = new ProfileService();

// ─── GET /api/profile/:userId ─────────────────────────────────────────────────

export const getProfile = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const targetId = (req.params as { userId: string }).userId;
    const profile = await svc.getProfile(targetId, req.user._id.toString());
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/profile/me ──────────────────────────────────────────────────────

export const getMyProfile = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const userId = req.user._id.toString();
    const profile = await svc.getProfile(userId, userId);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/profile/me ────────────────────────────────────────────────────

export const updateProfile = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const profile = await svc.updateProfile(req.user._id.toString(), req.body as never);
    res.json({ success: true, data: profile });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/profile/me/avatar ──────────────────────────────────────────────

export const uploadAvatar = async (
  req: RequestWithFile,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }
    const url = await svc.uploadAvatar(
      req.user._id.toString(),
      req.file.buffer,
      req.file.mimetype,
    );
    res.json({ success: true, data: { avatarUrl: url } });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/profile/:userId/posts ──────────────────────────────────────────

export const getProfilePosts = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string };
    const { lastPostId, limit } = req.query as { lastPostId?: string; limit?: string };
    const result = await svc.getProfilePosts(
      userId,
      req.user._id.toString(),
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
      lastPostId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/profile/:userId/followers ──────────────────────────────────────

export const getFollowers = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string };
    const { lastUserId, limit } = req.query as { lastUserId?: string; limit?: string };
    const result = await svc.getFollowers(
      userId,
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
      lastUserId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/profile/:userId/following ──────────────────────────────────────

export const getFollowing = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string };
    const { lastUserId, limit } = req.query as { lastUserId?: string; limit?: string };
    const result = await svc.getFollowing(
      userId,
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
      lastUserId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/profile/:userId/achievements ────────────────────────────────────

export const getAchievements = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string };
    const { lastAchievementId, limit } = req.query as { lastAchievementId?: string; limit?: string };
    const result = await svc.getAchievements(
      userId,
      limit ? Math.min(parseInt(limit, 10), 50) : 20,
      lastAchievementId,
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/profile/:userId/follow ────────────────────────────────────────

export const followUser = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string };
    const result = await svc.follow(req.user._id.toString(), userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/profile/:userId/follow ──────────────────────────────────────

export const unfollowUser = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { userId } = req.params as { userId: string };
    const result = await svc.unfollow(req.user._id.toString(), userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/profile/posts/:postId/like ────────────────────────────────────

export const likePost = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { postId } = req.params as { postId: string };
    const result = await svc.likePost(req.user._id.toString(), postId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/profile/posts/:postId/like ──────────────────────────────────

export const unlikePost = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { postId } = req.params as { postId: string };
    const result = await svc.unlikePost(req.user._id.toString(), postId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
