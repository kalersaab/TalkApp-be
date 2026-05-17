import { SECRET_KEY } from '@config';
import { HttpException } from '@exceptions/HttpException';

import { NextFunction, Request, Response } from 'express';
import { verify } from 'jsonwebtoken';

declare module 'express' {
  interface Request {
    user?: any;
  }
}

export const AuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const Auth = req.cookies?.Authorization;
    if (!Auth) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    await verify(Auth, SECRET_KEY, { algorithms: ['HS256'] }, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: 'Auth expire you need to login again', status: 403 });
      }
      req.user = decoded as any;
      next();
    });
  } catch (error) {
    next(new HttpException(401, 'Wrong authentication token'));
  }
};