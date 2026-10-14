import type { AccessTokenPayload } from '../auth/auth.types';

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export {};
