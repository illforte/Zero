/**
 * IMAP Mail Manager
 * Connects to IMAP/SMTP servers via the imap-proxy HTTP service.
 *
 * This is the TypeScript source for the ImapMailManager class compiled into
 * ghcr.io/lair404xyz/mail-zero-server-node. When rebuilding the image, this
 * file should replace apps/server/src/lib/driver/imap.ts in the Zero fork.
 *
 * Patches included (no runtime fix-server.js patches needed):
 *   - allowMethodOverride (patch1): applied via server startup config, not here
 *   - WebSocket stub (patch2): applied via server startup, not here
 *   - list() promotes $raw fields (patch3): baked in
 *   - IGetThreadsResponseSchema widening (patch4): in types.ts
 *   - Folder-aware thread IDs (patch5): baked in
 */

import type { IGetThreadResponse, MailManager, ManagerConfig } from './types';
import type { IOutgoingMessage, Label } from '../../types';
import type { CreateDraftData } from '../schemas';

// Resolved at runtime from environment
declare const env: {
  IMAP_PROXY_URL?: string;
  IMAP_URL?: string;
  SMTP_URL?: string;
};

interface ImapConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
}

interface SmtpConfig {
  user: string;
  password: string;
  host: string;
  port: number;
  secure: boolean;
}

interface ProxyResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export class ImapMailManager implements MailManager {
  config: ManagerConfig;
  private proxyUrl: string;
  private imapConfig: ImapConfig;
  private smtpConfig: SmtpConfig;

  constructor(config: ManagerConfig) {
    this.config = config;
    this.proxyUrl = (env as any).IMAP_PROXY_URL || 'http://127.0.0.1:3060';
    const imapUrl = (env as any).IMAP_URL || '';
    const smtpUrl = (env as any).SMTP_URL || '';
    this.imapConfig = this.parseImapUrl(imapUrl);
    this.smtpConfig = this.parseSmtpUrl(smtpUrl);
  }

  private parseImapUrl(url: string): ImapConfig {
    const match = url.match(/^imaps?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
    if (!match) {
      return { user: '', password: '', host: '', port: 993, tls: true };
    }
    return {
      user: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]),
      host: match[3],
      port: parseInt(match[4]),
      tls: url.startsWith('imaps://'),
    };
  }

  private parseSmtpUrl(url: string): SmtpConfig {
    const match = url.match(/^smtps?:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
    if (!match) {
      return { user: '', password: '', host: '', port: 587, secure: false };
    }
    return {
      user: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]),
      host: match[3],
      port: parseInt(match[4]),
      secure: url.startsWith('smtps://'),
    };
  }

  private async proxyRequest(endpoint: string, data: Record<string, unknown>): Promise<ProxyResult> {
    const response = await fetch(`${this.proxyUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Proxy request failed: ${response.statusText}`);
    }
    const result = (await response.json()) as ProxyResult;
    if (!result.success) {
      throw new Error(result.error || 'Proxy request failed');
    }
    return result;
  }

  async getMessageAttachments(_id: string) {
    return [];
  }

  async get(id: string): Promise<IGetThreadResponse> {
    // Parse folder prefix from id (format: "FOLDER:uid" or just "uid")
    const _fid = String(id);
    const _fp = _fid.indexOf(':');
    const _pfolder = _fp !== -1 ? _fid.slice(0, _fp) : 'INBOX';
    const _puid = parseInt(_fp !== -1 ? _fid.slice(_fp + 1) : _fid);

    const result = await this.proxyRequest('/api/imap/get', {
      config: this.imapConfig,
      folder: _pfolder,
      uid: _puid,
    });
    const email = result.email as any;

    // Parse "Name <email>" format for sender
    const _parseSender = (s: string | undefined) => {
      if (!s) return { name: '', email: '' };
      const m = s.match(/^"?([^"<>]+?)"?\s*<([^>]+)>/);
      return m ? { name: m[1].trim(), email: m[2].trim() } : { name: '', email: s.trim() };
    };

    const message = {
      id,
      threadId: id,
      title: email.subject || '',
      subject: email.subject || '',
      tags: [],
      sender: _parseSender(email.from),
      to: [{ email: email.to || '' }],
      cc: null,
      bcc: null,
      tls: false,
      receivedOn: email.date ? new Date(email.date).toISOString() : new Date().toISOString(),
      unread: true,
      body: email.html || email.text || '',
      processedHtml: email.html || email.text || '',
      blobUrl: '',
    };

    const threadResponse = {
      messages: [message],
      // Zero's Thread component requires `.latest` — without it every thread renders null content
      latest: message,
      hasUnread: true,
      totalReplies: 0,
      labels: [{ id: _pfolder, name: _pfolder === 'INBOX' ? 'Inbox' : _pfolder }],
    };
    return threadResponse as unknown as IGetThreadResponse;
  }

  async create(data: IOutgoingMessage) {
    const toAddresses = data.to.map((s: any) => (s.name ? `"${s.name}" <${s.email}>` : s.email));
    const ccAddresses = data.cc?.map((s: any) => (s.name ? `"${s.name}" <${s.email}>` : s.email));
    const bccAddresses = data.bcc?.map((s: any) => (s.name ? `"${s.name}" <${s.email}>` : s.email));
    const result = await this.proxyRequest('/api/smtp/send', {
      smtp: this.smtpConfig,
      from: (data as any).fromEmail || this.config.auth.email,
      to: toAddresses,
      cc: ccAddresses,
      bcc: bccAddresses,
      subject: data.subject,
      html: (data as any).message,
      inReplyTo: data.threadId,
    });
    return { id: (result as any).messageId || null };
  }

  async sendDraft(_id: string, data: IOutgoingMessage) {
    await this.create(data);
  }

  async createDraft(_data: CreateDraftData) {
    return { success: true };
  }

  async getDraft(_id: string): Promise<any> {
    throw new Error('Drafts not supported for IMAP in MVP');
  }

  async listDrafts(_params?: any) {
    return { threads: [], nextPageToken: null };
  }

  async delete(_id: string) {
    // TODO: implement delete via proxy
  }

  async list(params: { folder?: string; maxResults?: number; q?: string }) {
    const folder = this.mapFolderToImap(params.folder || 'inbox');
    const result = await this.proxyRequest('/api/imap/list', {
      config: this.imapConfig,
      folder,
      maxResults: params.maxResults || 20,
    });

    // Promote $raw fields so Zero UI thread-list renders from/subject/date
    const _parseFrom = (s: string | undefined) => {
      if (!s) return { name: '', email: '' };
      const m = s.match(/^"?([^"<>]+?)"?\s*<([^>]+)>/);
      return m ? { name: m[1].trim(), email: m[2].trim() } : { name: '', email: s.trim() };
    };

    const threads = ((result as any).emails as any[]).map((email) => ({
      // Embed folder in ID so get() can route to correct IMAP folder
      id: (folder && folder !== 'INBOX') ? folder + ':' + email.uid.toString() : email.uid.toString(),
      historyId: null,
      $raw: email,
      subject: email.subject || '',
      from: _parseFrom(email.from),
      snippet: '',
      date: email.date || null,
      labels: [],
      unread: email.flags ? !email.flags.includes('\\Seen') : true,
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
    return [];
  }

  async getTokens(_code: string) {
    throw new Error('OAuth not supported for IMAP');
  }

  async getUserInfo() {
    return {
      address: this.config.auth.email,
      name: this.config.auth.email.split('@')[0] || 'User',
      photo: '',
    };
  }

  getScope() {
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

  async modifyLabels(_id: string[], _options: { addLabels: string[]; removeLabels: string[] }) {
    // IMAP doesn't have labels like Gmail — no-op for now
  }

  async getAttachment(_messageId: string, _attachmentId: string) {
    return undefined;
  }

  async getUserLabels() {
    try {
      const result = await this.proxyRequest('/api/imap/folders', {
        config: this.imapConfig,
      });
      return ((result as any).folders as string[]).map((folder) => ({
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
    return { id, name: id, type: 'system' } as unknown as Label;
  }

  async createLabel(_label: { name: string }) {
    // Not supported in MVP
  }

  async updateLabel(_id: string, _label: { name: string }) {
    // Not supported in MVP
  }

  async deleteLabel(_id: string) {
    // Not supported in MVP
  }

  async getEmailAliases() {
    return [{ email: this.config.auth.email, primary: true }];
  }

  async revokeToken(_token: string) {
    return true;
  }

  async deleteAllSpam() {
    return { success: false, message: 'Not supported in MVP', count: 0 };
  }
}
