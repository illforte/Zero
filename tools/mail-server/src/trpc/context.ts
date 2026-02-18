import type { Context } from 'hono';
import type { HonoContext } from '../types.js';
import type { Auth, SessionUser } from '../auth.js';
import type { DB } from '../db/index.js';
import type { MailManager } from '../driver/types.js';
import type { NodeZeroDB } from '../db/node-zero-db.js';

export type TrpcContext = {
  c: Context<HonoContext>;
  sessionUser: SessionUser | undefined;
  auth: Auth;
  db: DB;
};

export type AuthenticatedContext = TrpcContext & {
  sessionUser: SessionUser;
  zeroDB: NodeZeroDB;
};

export type ActiveConnectionContext = AuthenticatedContext & {
  activeConnection: {
    id: string;
    userId: string;
    email: string;
    name: string | null;
    picture: string | null;
    providerId: 'google' | 'microsoft' | 'imap';
    accessToken: string | null;
    refreshToken: string | null;
    scope: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };
  driver: MailManager;
};
