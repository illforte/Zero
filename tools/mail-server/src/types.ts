import type { SessionUser } from './auth.js';

export type CfAccessUser = {
  email: string;
  name: string;
  sub: string;
};

export type HonoVariables = {
  sessionUser?: SessionUser;
  cfAccessUser?: CfAccessUser;
};

export type HonoContext = { Variables: HonoVariables };

// Mail types (copied from apps/server/src/types.ts)
export interface Sender {
  name?: string;
  email: string;
}

export interface IOutgoingMessage {
  to: Sender[];
  cc?: Sender[];
  bcc?: Sender[];
  subject: string;
  message: string;
  attachments: {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    base64: string;
  }[];
  headers: Record<string, string>;
  threadId?: string;
  fromEmail?: string;
  isForward?: boolean;
  originalMessage?: string | null;
}

export type Label = {
  id: string;
  name: string;
  color?: {
    backgroundColor: string;
    textColor: string;
  };
  type: string;
  labels?: Label[];
  count?: number;
};

export interface DeleteAllSpamResponse {
  success: boolean;
  message: string;
  count?: number;
  error?: string;
}
