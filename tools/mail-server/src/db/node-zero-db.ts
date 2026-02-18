/**
 * NodeZeroDB — Replaces the ZeroDB Durable Object with direct Drizzle queries.
 * Provides the same interface as the original DO but runs on Node.js.
 */
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { DB } from './index.js';
import {
  user as userTable,
  session as sessionTable,
  connection as connectionTable,
  userSettings as userSettingsTable,
  emailTemplate as emailTemplateTable,
} from './schema.js';

export class NodeZeroDB {
  constructor(
    private readonly db: DB,
    private readonly userId: string,
  ) {}

  async findUser() {
    return this.db.query.user.findFirst({
      where: eq(userTable.id, this.userId),
    });
  }

  async findUserConnection(connectionId: string) {
    return this.db.query.connection.findFirst({
      where: and(
        eq(connectionTable.id, connectionId),
        eq(connectionTable.userId, this.userId),
      ),
    });
  }

  async findFirstConnection() {
    return this.db.query.connection.findFirst({
      where: eq(connectionTable.userId, this.userId),
    });
  }

  async findManyConnections() {
    return this.db.query.connection.findMany({
      where: eq(connectionTable.userId, this.userId),
    });
  }

  async createConnection(
    providerId: 'google' | 'microsoft' | 'imap',
    email: string,
    info: {
      name?: string;
      picture?: string;
      accessToken?: string | null;
      refreshToken?: string | null;
      scope?: string;
      expiresAt?: Date;
    },
  ) {
    const now = new Date();
    return this.db
      .insert(connectionTable)
      .values({
        id: uuidv4(),
        userId: this.userId,
        email,
        name: info.name || null,
        picture: info.picture || null,
        accessToken: info.accessToken || null,
        refreshToken: info.refreshToken || null,
        scope: info.scope || '',
        providerId,
        expiresAt: info.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  }

  async updateConnection(
    connectionId: string,
    data: Partial<{
      accessToken: string | null;
      refreshToken: string | null;
      name: string | null;
      picture: string | null;
    }>,
  ) {
    return this.db
      .update(connectionTable)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(connectionTable.id, connectionId), eq(connectionTable.userId, this.userId)),
      );
  }

  async updateUser(
    data: Partial<{
      defaultConnectionId: string | null;
      name: string;
    }>,
  ) {
    return this.db
      .update(userTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userTable.id, this.userId));
  }

  async findUserSettings() {
    return this.db.query.userSettings.findFirst({
      where: eq(userSettingsTable.userId, this.userId),
    });
  }

  async insertUserSettings(settings: Record<string, unknown>) {
    const now = new Date();
    return this.db.insert(userSettingsTable).values({
      id: uuidv4(),
      userId: this.userId,
      settings,
      createdAt: now,
      updatedAt: now,
    });
  }

  async updateUserSettings(settings: Record<string, unknown>) {
    return this.db
      .update(userSettingsTable)
      .set({ settings, updatedAt: new Date() })
      .where(eq(userSettingsTable.userId, this.userId));
  }

  async deleteUser() {
    return this.db.delete(userTable).where(eq(userTable.id, this.userId));
  }

  async listEmailTemplates() {
    return this.db.query.emailTemplate.findMany({
      where: eq(emailTemplateTable.userId, this.userId),
    });
  }

  async createEmailTemplate(data: {
    id: string;
    name: string;
    subject?: string | null;
    body?: string | null;
    to?: string[] | null;
    cc?: string[] | null;
    bcc?: string[] | null;
  }) {
    const now = new Date();
    return this.db
      .insert(emailTemplateTable)
      .values({
        ...data,
        userId: this.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
  }

  async deleteEmailTemplate(templateId: string) {
    return this.db
      .delete(emailTemplateTable)
      .where(
        and(
          eq(emailTemplateTable.id, templateId),
          eq(emailTemplateTable.userId, this.userId),
        ),
      );
  }

  // Session management methods
  async createSession(token: string, expiresAt: Date, ipAddress?: string, userAgent?: string) {
    const now = new Date();
    return this.db
      .insert(sessionTable)
      .values({
        id: uuidv4(),
        token,
        userId: this.userId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      })
      .returning();
  }
}

export function getNodeZeroDB(db: DB, userId: string): NodeZeroDB {
  return new NodeZeroDB(db, userId);
}
