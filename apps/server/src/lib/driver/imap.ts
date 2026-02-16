import type { MailManager, ManagerConfig, IGetThreadResponse, ParsedDraft } from './types';
import type { IOutgoingMessage, Label, DeleteAllSpamResponse } from '../../types';
import type { CreateDraftData } from '../schemas';
import { env } from '../../env';

/**
 * IMAP Mail Manager
 *
 * Connects to IMAP/SMTP servers via HTTP proxy service running on lair404
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

    // Parse IMAP credentials from config
    // Format: imap://user:pass@host:port
    const imapUrl = env.IMAP_URL || '';
    const smtpUrl = env.SMTP_URL || '';

    this.imapConfig = this.parseImapUrl(imapUrl);
    this.smtpConfig = this.parseSmtpUrl(smtpUrl);
  }

  private parseImapUrl(url: string) {
    // Format: imap://user:pass@host:port or imaps://user:pass@host:port
    const match = url.match(/^imaps?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
    if (!match) {
      throw new Error('Invalid IMAP_URL format. Expected: imap://user:pass@host:port');
    }

    return {
      user: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]),
      host: match[3],
      port: parseInt(match[4]),
      tls: url.startsWith('imaps://'),
    };
  }

  private parseSmtpUrl(url: string) {
    // Format: smtp://user:pass@host:port or smtps://user:pass@host:port
    const match = url.match(/^smtps?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
    if (!match) {
      throw new Error('Invalid SMTP_URL format. Expected: smtp://user:pass@host:port');
    }

    return {
      user: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]),
      host: match[3],
      port: parseInt(match[4]),
      secure: url.startsWith('smtps://'),
    };
  }

  private async proxyRequest(endpoint: string, data: any) {
    const response = await fetch(`${this.proxyUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`Proxy request failed: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Proxy request failed');
    }

    return result;
  }

  async getMessageAttachments(id: string) {
    // TODO: Implement attachment fetching
    return [];
  }

  async get(id: string): Promise<IGetThreadResponse> {
    const result = await this.proxyRequest('/api/imap/get', {
      config: this.imapConfig,
      folder: 'INBOX',
      uid: parseInt(id),
    });

    const email = result.email;

    return {
      messages: [{
        id,
        threadId: id,
        snippet: email.text?.substring(0, 100) || '',
        from: email.from || '',
        to: email.to || '',
        subject: email.subject || '',
        date: email.date,
        body: email.html || email.text || '',
        internalDate: email.date,
        labelIds: [],
        unread: true, // TODO: Get from flags
        headers: {},
      }],
      hasUnread: false,
      totalReplies: 0,
      labels: [{ id: 'INBOX', name: 'Inbox' }],
    };
  }

  async create(data: IOutgoingMessage) {
    const result = await this.proxyRequest('/api/smtp/send', {
      smtp: this.smtpConfig,
      from: data.from || this.config.auth.email,
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      html: data.body,
      inReplyTo: data.threadId,
    });

    return { id: result.messageId };
  }

  async sendDraft(id: string, data: IOutgoingMessage) {
    // For IMAP, drafts are just regular sends
    await this.create(data);
  }

  async createDraft(data: CreateDraftData) {
    // IMAP doesn't support drafts the same way - just return success
    return { success: true };
  }

  async getDraft(id: string): Promise<ParsedDraft> {
    throw new Error('Drafts not supported for IMAP');
  }

  async listDrafts(params: any) {
    return { threads: [], nextPageToken: null };
  }

  async delete(id: string) {
    // TODO: Implement delete
  }

  async list(params: { folder: string; query?: string; maxResults?: number; pageToken?: string | number }) {
    const result = await this.proxyRequest('/api/imap/list', {
      config: this.imapConfig,
      folder: params.folder || 'INBOX',
      maxResults: params.maxResults || 50,
    });

    const threads = result.emails.map((email: any) => ({
      id: email.uid.toString(),
      historyId: null,
      $raw: email,
    }));

    return { threads, nextPageToken: null };
  }

  async count() {
    return [];
  }

  async getTokens(code: string) {
    throw new Error('OAuth not supported for IMAP');
  }

  async getUserInfo() {
    return {
      address: this.config.auth.email,
      name: this.config.auth.email.split('@')[0],
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
      uids: threadIds.map(id => parseInt(id)),
      read: true,
    });
  }

  async markAsUnread(threadIds: string[]) {
    await this.proxyRequest('/api/imap/mark-read', {
      config: this.imapConfig,
      folder: 'INBOX',
      uids: threadIds.map(id => parseInt(id)),
      read: false,
    });
  }

  normalizeIds(id: string[]) {
    return { threadIds: id };
  }

  async modifyLabels(id: string[], options: { addLabels: string[]; removeLabels: string[] }) {
    // IMAP doesn't support labels the same way
  }

  async getAttachment(messageId: string, attachmentId: string) {
    return undefined;
  }

  async getUserLabels(): Promise<Label[]> {
    const result = await this.proxyRequest('/api/imap/folders', {
      config: this.imapConfig,
    });

    return result.folders.map((folder: string) => ({
      id: folder,
      name: folder,
      type: 'system',
    }));
  }

  async getLabel(id: string): Promise<Label> {
    return { id, name: id, type: 'system' };
  }

  async createLabel(label: { name: string; color?: { backgroundColor: string; textColor: string } }) {
    // Not supported
  }

  async updateLabel(id: string, label: { name: string; color?: { backgroundColor: string; textColor: string } }) {
    // Not supported
  }

  async deleteLabel(id: string) {
    // Not supported
  }

  async getEmailAliases() {
    return [{ email: this.config.auth.email, primary: true }];
  }

  async revokeToken(token: string) {
    return true;
  }

  async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    return { deletedCount: 0 };
  }
}
