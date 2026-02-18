import { z } from 'zod';
import type { IOutgoingMessage, Label, DeleteAllSpamResponse } from '../types.js';

export const ParsedMessageSchema = z.object({
  id: z.string(),
  connectionId: z.string().optional(),
  title: z.string(),
  subject: z.string(),
  tags: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
  sender: z.object({ name: z.string().optional(), email: z.string() }),
  to: z.array(z.object({ name: z.string().optional(), email: z.string() })),
  cc: z.array(z.object({ name: z.string().optional(), email: z.string() })).nullable(),
  bcc: z.array(z.object({ name: z.string().optional(), email: z.string() })).nullable(),
  tls: z.boolean(),
  listUnsubscribe: z.string().optional(),
  listUnsubscribePost: z.string().optional(),
  receivedOn: z.string(),
  unread: z.boolean(),
  body: z.string(),
  processedHtml: z.string(),
  blobUrl: z.string(),
  decodedBody: z.string().optional(),
  references: z.string().optional(),
  inReplyTo: z.string().optional(),
  replyTo: z.string().optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        attachmentId: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
        body: z.string(),
        headers: z.array(z.object({ name: z.string().nullable(), value: z.string().nullable() })),
      }),
    )
    .optional(),
  isDraft: z.boolean().optional(),
});

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>;

export interface IGetThreadResponse {
  messages: ParsedMessage[];
  latest?: ParsedMessage;
  hasUnread: boolean;
  totalReplies: number;
  labels: { id: string; name: string }[];
  isLatestDraft?: boolean;
}

export const IGetThreadResponseSchema = z.object({
  messages: z.array(ParsedMessageSchema),
  latest: ParsedMessageSchema.optional(),
  hasUnread: z.boolean(),
  totalReplies: z.number(),
  labels: z.array(z.object({ id: z.string(), name: z.string() })),
});

export interface ParsedDraft {
  id: string;
  to?: string[];
  subject?: string;
  content?: string;
  rawMessage?: { internalDate?: string | null };
  cc?: string[];
  bcc?: string[];
}

export type ManagerConfig = {
  auth: {
    userId: string;
    accessToken: string;
    refreshToken: string;
    email: string;
  };
};

export const IGetThreadsResponseSchema = z.object({
  threads: z.array(
    z.object({
      id: z.string(),
      historyId: z.string().nullable(),
      $raw: z.unknown().optional(),
    }),
  ),
  nextPageToken: z.string().nullable(),
});

export interface IGetThreadsResponse {
  threads: { id: string; historyId: string | null; $raw?: unknown }[];
  nextPageToken: string | null;
}

export const createDraftData = z.object({
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  message: z.string(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        size: z.number(),
        lastModified: z.number(),
        base64: z.string(),
      }),
    )
    .optional(),
  id: z.string().nullable(),
  threadId: z.string().nullable(),
  fromEmail: z.string().nullable(),
});

export type CreateDraftData = z.infer<typeof createDraftData>;

export interface MailManager {
  config: ManagerConfig;
  getMessageAttachments(id: string): Promise<
    {
      filename: string;
      mimeType: string;
      size: number;
      attachmentId: string;
      headers: { name: string; value: string }[];
      body: string;
    }[]
  >;
  get(id: string): Promise<IGetThreadResponse>;
  create(data: IOutgoingMessage): Promise<{ id?: string | null }>;
  sendDraft(id: string, data: IOutgoingMessage): Promise<void>;
  createDraft(
    data: CreateDraftData,
  ): Promise<{ id?: string | null; success?: boolean; error?: string }>;
  getDraft(id: string): Promise<ParsedDraft>;
  listDrafts(params: { q?: string; maxResults?: number; pageToken?: string }): Promise<{
    threads: { id: string; historyId: string | null; $raw: unknown }[];
    nextPageToken: string | null;
  }>;
  delete(id: string): Promise<void>;
  list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }): Promise<{
    threads: { id: string; historyId: string | null; $raw?: unknown }[];
    nextPageToken: string | null;
  }>;
  count(): Promise<{ count?: number; label?: string }[]>;
  getTokens(code: string): Promise<{ tokens: { access_token?: string; refresh_token?: string; expiry_date?: number } }>;
  getUserInfo(tokens?: ManagerConfig['auth']): Promise<{ address: string; name: string; photo: string }>;
  getScope(): string;
  listHistory<T>(historyId: string): Promise<{ history: T[]; historyId: string }>;
  markAsRead(threadIds: string[]): Promise<void>;
  markAsUnread(threadIds: string[]): Promise<void>;
  normalizeIds(id: string[]): { threadIds: string[] };
  modifyLabels(
    id: string[],
    options: { addLabels: string[]; removeLabels: string[] },
  ): Promise<void>;
  getAttachment(messageId: string, attachmentId: string): Promise<string | undefined>;
  getUserLabels(): Promise<Label[]>;
  getLabel(id: string): Promise<Label>;
  createLabel(label: { name: string; color?: { backgroundColor: string; textColor: string } }): Promise<void>;
  updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ): Promise<void>;
  deleteLabel(id: string): Promise<void>;
  getEmailAliases(): Promise<{ email: string; name?: string; primary?: boolean }[]>;
  revokeToken(token: string): Promise<boolean>;
  deleteAllSpam(): Promise<DeleteAllSpamResponse>;
}
