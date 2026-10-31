#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/27c096708602b4d9c830ecb89d4697f16220f9fe1bccb92b91f69f517359c096/contract';
import endContract from '../../snapshots/27c096708602b4d9c830ecb89d4697f16220f9fe1bccb92b91f69f517359c096/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7b1789015b91a7a866aa67d6d00c9c3b37c4f2a15729e824e3c67a86be246bbf/contract';
import startContract from '../../snapshots/7b1789015b91a7a866aa67d6d00c9c3b37c4f2a15729e824e3c67a86be246bbf/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'ModerationResult',
        columns: [
          col('categories', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mediaUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('moderation_status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reasons', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'ModerationResult_moderation_status_check_22ab0024',
            "\"moderation_status\" IN ('PENDING', 'APPROVED', 'REJECTED', 'REVIEW')",
          ),
          checkExpression(
            'ModerationResult_postType_check_07bbca23',
            "\"postType\" IN ('TEXT', 'IMAGE', 'VIDEO', 'MIXED', 'POLL')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'ModerationResult',
        constraint: 'ModerationResult_postId_key',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationResult',
        index: 'ModerationResult_moderation_status_idx_82c92531',
        columns: ['moderation_status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ModerationResult',
        index: 'ModerationResult_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ModerationResult',
        foreignKey: {
          name: 'ModerationResult_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'Post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
