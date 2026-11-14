#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0507416b6a1d073c29323bf94d7ad95b2793a74b40ab47f3e7f345952033aceb/contract';
import startContract from '../../snapshots/0507416b6a1d073c29323bf94d7ad95b2793a74b40ab47f3e7f345952033aceb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d2fb03a834ee8730b95f3e37490aeedc4b1fd947f59eb90094918d759bb1014b/contract';
import endContract from '../../snapshots/d2fb03a834ee8730b95f3e37490aeedc4b1fd947f59eb90094918d759bb1014b/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'VideoModerationResult',
        columns: [
          col('audioModerationResult', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('audioTranscript', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('finalStatus', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('frameModerationResult', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('processingStatus', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('reasons', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('videoUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'VideoModerationResult_finalStatus_check_c37955c3',
            "\"finalStatus\" IN ('PENDING', 'APPROVED', 'REJECTED', 'REVIEW')",
          ),
          checkExpression(
            'VideoModerationResult_processingStatus_check_4f901583',
            "\"processingStatus\" IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'VideoModerationResult',
        constraint: 'VideoModerationResult_postId_key',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'VideoModerationResult',
        index: 'VideoModerationResult_finalStatus_idx_fb451742',
        columns: ['finalStatus'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'VideoModerationResult',
        index: 'VideoModerationResult_processingStatus_idx_6f216ba4',
        columns: ['processingStatus'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'VideoModerationResult',
        index: 'VideoModerationResult_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'VideoModerationResult',
        foreignKey: {
          name: 'VideoModerationResult_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'Post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
