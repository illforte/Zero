import type { DeleteAllSpamResponse, IOutgoingMessage, Label } from '../../types';
import { decrypt } from '../crypto';
import * as nodemailer from 'nodemailer';
import type { CreateDraftData } from '../schemas';
import type { IGetThreadResponse, MailManager, ManagerConfig, ParsedDraft } from './types';

export class Lair404MailManager implements MailManager {
  constructor(public config: ManagerConfig) {}

  private get relayConfig() {
    try {
      return JSON.parse(this.config.auth.accessToken || '{}');
    } catch {
      return {};
    }
  }

  private async getCredentials() {
    const config = this.relayConfig;
    if (!config.password) {
      throw new Error('No password found in connection config');
    }
    const decryptedPassword = await decrypt(config.password);
    return {
      user: this.config.auth.email,
      pass: decryptedPassword,
      smtpHost: config.smtpHost || 'mail.lair404.xyz',
      smtpPort: config.smtpPort || 587,
    };
  }

  public getScope(): string {
    return 'lair404';
  }

  public async getUserInfo() {
    return {
      address: this.config.auth.email || this.relayConfig.email || 'MasterSpl1nter@lair404.xyz',
      name: (this.config.auth.email || this.relayConfig.email || 'Lair404 User').split('@')[0],
      photo: '',
    };
  }

  public async getTokens(_code: string) {
    return { tokens: { access_token: this.config.auth.accessToken, refresh_token: this.config.auth.refreshToken } };
  }

  public async count() {
    return [{ label: 'Inbox', count: 0 }];
  }

  public async list() {
    return { threads: [], nextPageToken: null };
  }

  public async get(_id: string): Promise<IGetThreadResponse> {
    throw new Error('Not implemented');
  }

  public async create(data: IOutgoingMessage) {
    const creds = await this.getCredentials();
    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpPort === 465,
      auth: {
        user: creds.user,
        pass: creds.pass,
      },
    });

    const info = await transporter.sendMail({
      from: `"${creds.user.split('@')[0]}" <${creds.user}>`,
      to: data.to.map(t => t.email).join(', '),
      cc: data.cc?.map(t => t.email).join(', '),
      bcc: data.bcc?.map(t => t.email).join(', '),
      subject: data.subject || '',
      text: data.message,
      html: data.message, // In real life, convert if possible, but here we assume message is html-ish
    });

    console.log('Lair404: Email sent', info.messageId);
    return { id: info.messageId || 'lair404-msg-' + Date.now() };
  }

  public async delete(id: string) {
    console.log('Lair404: Deleting email', id);
  }

  public async markAsRead(id: string[]) {
    console.log('Lair404: Marking as read', id);
  }

  public async markAsUnread(id: string[]) {
    console.log('Lair404: Marking as unread', id);
  }

  public normalizeIds(ids: string[]) {
    return { threadIds: ids };
  }

  public async modifyLabels(id: string[], options: { addLabels: string[]; removeLabels: string[] }) {
    console.log('Lair404: Modifying labels', id, options);
  }

  public async getAttachment(_messageId: string, _attachmentId: string) {
    return undefined;
  }

  public async getUserLabels() {
    return [];
  }

  public async getLabel(_id: string): Promise<Label> {
    throw new Error('Not implemented');
  }

  public async createLabel(label: { name: string }) {
    console.log('Lair404: Creating label', label);
  }

  public async updateLabel(id: string, label: { name: string }) {
    console.log('Lair404: Updating label', id, label);
  }

  public async deleteLabel(id: string) {
    console.log('Lair404: Deleting label', id);
  }

  public async getEmailAliases() {
    return [{ email: this.config.auth.email, primary: true }];
  }

  public async revokeToken(_token: string) {
    return true;
  }

  public async deleteAllSpam(): Promise<DeleteAllSpamResponse> {
    return { success: true, message: 'Cleaned' };
  }

  public async getRawEmail(_id: string) {
    return '';
  }

  public async createDraft(_data: CreateDraftData) {
    return { id: 'lair404-draft-' + Date.now(), success: true };
  }

  public async getDraft(_id: string): Promise<ParsedDraft> {
    throw new Error('Not implemented');
  }

  public async listDrafts() {
    return { threads: [], nextPageToken: null };
  }

  public async deleteDraft(id: string) {
    console.log('Lair404: Deleting draft', id);
  }

  public async sendDraft(id: string, data: IOutgoingMessage) {
    console.log('Lair404: Sending draft', id, data);
  }
  
  public async getMessageAttachments(_id: string) {
    return [];
  }

  public async listHistory<T>(historyId: string) {
    return { history: [] as T[], historyId };
  }
}
