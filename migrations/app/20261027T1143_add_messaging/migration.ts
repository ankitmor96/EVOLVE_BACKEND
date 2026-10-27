#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/378cec87c4c214ac705068ddeb841130f2c755aa083b7a68c5f2048959e295b0/contract';
import endContract from '../../snapshots/378cec87c4c214ac705068ddeb841130f2c755aa083b7a68c5f2048959e295b0/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e997e7671e64d5dcfbb139dac6d5f16a825e6cd760ddcb8fb12c98f56f93a15e/contract';
import startContract from '../../snapshots/e997e7671e64d5dcfbb139dac6d5f16a825e6cd760ddcb8fb12c98f56f93a15e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'Conversation',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'ConversationParticipant',
        columns: [
          col('conversationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('joinedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Message',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('conversationId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deletedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isRead', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('senderId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ConversationParticipant',
        constraint: 'ConversationParticipant_conversationId_userId_key',
        columns: ['conversationId', 'userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ConversationParticipant',
        index: 'ConversationParticipant_conversationId_idx_669215a6',
        columns: ['conversationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ConversationParticipant',
        index: 'ConversationParticipant_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Message',
        index: 'Message_conversationId_createdAt_idx_44d4ac61',
        columns: ['conversationId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Message',
        index: 'Message_conversationId_idx_669215a6',
        columns: ['conversationId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Message',
        index: 'Message_senderId_idx_4689c490',
        columns: ['senderId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ConversationParticipant',
        foreignKey: {
          name: 'ConversationParticipant_conversationId_fkey',
          columns: ['conversationId'],
          references: { schema: 'public', table: 'Conversation', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ConversationParticipant',
        foreignKey: {
          name: 'ConversationParticipant_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Message',
        foreignKey: {
          name: 'Message_conversationId_fkey',
          columns: ['conversationId'],
          references: { schema: 'public', table: 'Conversation', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Message',
        foreignKey: {
          name: 'Message_senderId_fkey',
          columns: ['senderId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
