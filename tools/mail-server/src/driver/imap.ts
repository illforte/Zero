import type {
  MailManager,
  ManagerConfig,
  IGetThreadResponse,
  ParsedDraft,
  CreateDraftData,
} from './types.js';
import type { IOutgoingMessage, Label, DeleteAllSpamResponse } from '../types.js';
import { env } from '../env.js';

/**
 * IMAP Mail Manager
 * Connects to IMAP/SMTP servers via the imap-proxy HTTP service.
 */
export class ImapMailManager implements MailManager {
  private proxyUrl: string;
  private imapConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
    tls: boolean;
  };
  private smtpConfig: {
    host: string;
    port: number;
    user: string;
    password: string;
    secure: boolean;
  };

  constructor(public config: ManagerConfig) {
    this.proxyUrl = env.IMAP_PROXY_URL || 'http://127.0.0.1:3060';

    const imapUrl = env.IMAP_URL || '';
    const smtpUrl = env.SMTP_URL || '';

    this.imapConfig = this.parseImapUrl(imapUrl);
    this.smtpConfig = this.parseSmtpUrl(smtpUrl);
  }

  private parseImapUrl(url: string) {
    const match = url.match(/^imaps?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
    if (!match) {
      // Return a default config if URL is invalid (for dev/test)
      return { user: '', password: '', host: '', port: 993, tls: true };
    }
    return {
      user: decodeURIComponent(match[1]!),
      password: decodeURIComponent(match[2]!),
      host: match[3]!,
      port: parseInt(match[4]!),
      tls: url.startsWith('imaps://'),
    };
  }

  private parseSmtpUrl(url: string) {
    const match = url.match(/^smtps?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
    if (!match) {
      return { user: '', password: '', host: '', port: 587, secure: false };
    }
    return {
      user: decodeURIComponent(match[1]!),
      password: decodeURIComponent(match[2]!),
      host: match[3]!,
      port: parseInt(match[4]!),
      secure: url.startsWith('smtps://'),
    };
  }

  private async proxyRequest(endpoint: string, data: unknown) {
    const response = await fetch(`${this.proxyUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Proxy request failed: ${response.statusText}`);
    }

    const result = (await response.json()) as { success: boolean; error?: string };
    if (!result.success) {
      throw new Error(result.error || 'Proxy request failed');
    }

    return result as Record<string, unknown>;
  }

  async getMessageAttachments(id: string) {
    // TODO: implement attachment fetching via proxy
    return [] as { filename: string; mimeType: string; size: number; attachmentId: string; headers: { name: string; value: string }[]; body: string }[];
  }

  async get(id: string): Promise<IGetThreadResponse> {
    const result = await this.proxyRequest('/api/imap/get', {
      config: this.imapConfig,
      folder: 'INBOX',
      uid: parseInt(id),
    }) as { email: { from?: string; to?: string; subject?: string; date?: string; html?: string; text?: string } };

    const email = result.email;

    return {
      messages: [
        {
          id,
          threadId: id,
          title: email.subject || '',
          subject: email.subject || '',
          tags: [],
          sender: { email: email.from || '' },
          to: [{ email: email.to || '' }],
          cc: null,
          bcc: null,
          tls: false,
          receivedOn: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
          unread: true,
          body: email.html || email.text || '',
          processedHtml: email.html || email.text || '',
          blobUrl: '',
        },
      ],
      hasUnread: false,
      totalReplies: 0,
      labels: [{ id: 'INBOX', name: 'Inbox' }],
    };
  }

  async create(data: IOutgoingMessage) {
    const toAddresses = data.to.map((s) => (s.name ? `"${s.name}" <${s.email}>` : s.email));
    const ccAddresses = data.cc?.map((s) => (s.name ? `"${s.name}" <${s.email}>` : s.email));
    const bccAddresses = data.bcc?.map((s) => (s.name ? `"${s.name}" <${s.email}>` : s.email));

    const result = await this.proxyRequest('/api/smtp/send', {
      smtp: this.smtpConfig,
      from: data.fromEmail || this.config.auth.email,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: data.subject,
      html: data.message, // tRPC input uses 'message' for HTML body
      inReplyTo: data.threadId,
    }) as { messageId?: string };

    return { id: result.messageId || null };
  }

  async sendDraft(id: string, data: IOutgoingMessage) {
    await this.create(data);
  }

  async createDraft(data: CreateDraftData) {
    // IMAP doesn't support server-side drafts in this MVP
    return { success: true };
  }

  async getDraft(id: string): Promise<ParsedDraft> {
    throw new Error('Drafts not supported for IMAP in MVP');
  }

  async listDrafts(params: { q?: string; maxResults?: number; pageToken?: string }) {
    return { threads: [] as { id: string; historyId: string | null; $raw: unknown }[], nextPageToken: null };
  }

  async delete(id: string) {
    // TODO: implement delete via proxy
  }

  async list(params: {
    folder: string;
    query?: string;
    maxResults?: number;
    labelIds?: string[];
    pageToken?: string | number;
  }) {
    const folder = this.mapFolderToImap(params.folder || 'inbox');

    const result = await this.proxyRequest('/api/imap/list', {
      config: this.imapConfig,
      folder,
      maxResults: params.maxResults || 20,
    }) as { emails: { uid: number | string }[] };

    const threads = result.emails.map((email) => ({
      id: email.uid.toString(),
      historyId: null as string | null,
      $raw: email,
    }));

    return { threads, nextPageToken: null };
  }

  private mapFolderToImap(folder: string): string {
    const map: Record<string, string> = {
      inbox: 'INBOX',
      sent: 'Sent',
      drafts: 'Drafts',
      spam: 'Spam',
      trash: 'Trash',
      archive: 'Archive',
      bin: 'Trash',
    };
    return map[folder.toLowerCase()] || 'INBOX';
  }

  async count() {
    return [] as { count?: number; label?: string }[];
  }

  async getTokens(_code: string): Promise<{ tokens: { access_token?: string; refresh_token?: string; expiry_date?: number } }> {
    throw new Error('OAuth not supported for IMAP');
  }

  async getUserInfo() {
    return {
      address: this.config.auth.email,
      name: this.config.auth.email.split('@')[0] || 'User',
      photo: '',
    };
  }

  getScope(): string {
    return '';
  }

  async listHistory<T>(historyId: string) {
    return { history: [] as T[], historyId };
  }

  async markAsRead(threadIds: string[]) {
    await this.proxyRequest('/api/imap/mark-read', {
      config: this.imapConfig,
      folder: 'INBOX',
      uids: threadIds.map((id) => parseInt(id)),
      read: true,
    });
  }

  async markAsUnread(threadIds: string[]) {
    await this.proxyRequest('/api/imap/mark-read', {
      config: this.imapConfig,
      folder: 'INBOX',
      uids: threadIds.map((id) => parseInt(id)),
      read: false,
    });
  }

  normalizeIds(id: string[]) {
    return { threadIds: id };
  }

  async modifyLabels(
    id: string[],
    options: { addLabels: string[]; removeLabels: string[] },
  ) {
    // IMAP doesn't have labels like Gmail — no-op for now
    // TODO: map STARRED/IMPORTANT/TRASH to IMAP flags
  }

  async getAttachment(messageId: string, attachmentId: string) {
    return undefined;
  }

  async getUserLabels(): Promise<Label[]> {
    try {
      const result = await this.proxyRequest('/api/imap/folders', {
        config: this.imapConfig,
      }) as { folders: string[] };

      return result.folders.map((folder) => ({
        id: folder,
        name: folder,
        type: 'system',
      }));
    } catch {
      return [
        { id: 'INBOX', name: 'Inbox', type: 'system' },
        { id: 'SENT', name: 'Sent', type: 'system' },
        { id: 'SPAM', name: 'Spam', type: 'system' },
        { id: 'TRASH', name: 'Trash', type: 'system' },
      ];
    }
  }

  async getLabel(id: string): Promise<Label> {
    return { id, name: id, type: 'system' };
  }

  async createLabel(label: { name: string; color?: { backgroundColor: string; textColor: string } }) {
    // Not supported in MVP
  }

  async updateLabel(
    id: string,
    label: { name: string; color?: { backgroundColor: string; textColor: string } },
  ) {
    // Not supported in MVP
  }

  async deleteLabel(id: string) {
    // Not supported in MVP
  }

  async getEmailAliases() {
    return [{ email: this.config.auth.email, primary: true }];
  }

  async revokeToken(token: string) {
    return true;
  }

  async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    return { success: false, message: 'Not supported in MVP', count: 0 };
  }
}
