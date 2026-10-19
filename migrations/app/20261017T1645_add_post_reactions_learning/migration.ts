#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/25dfd7d47aca9e5bbb77b5ee008888a3e0f52d3c4dcae30bb52f631e51b48824/contract';
import startContract from '../../snapshots/25dfd7d47aca9e5bbb77b5ee008888a3e0f52d3c4dcae30bb52f631e51b48824/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/6808c6bd67f235a5383d5bb1dc190429163d9ee45148699910958fd4999eeeff/contract';
import endContract from '../../snapshots/6808c6bd67f235a5383d5bb1dc190429163d9ee45148699910958fd4999eeeff/contract.json' with { type: 'json' };
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
        table: 'PostLearning',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'PostReaction',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('reactionType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'PostReaction_reactionType_check_ccd11de8',
            "\"reactionType\" IN ('APPRECIATE', 'HELPFUL')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PostLearning',
        constraint: 'PostLearning_postId_userId_key',
        columns: ['postId', 'userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PostReaction',
        constraint: 'PostReaction_postId_userId_key',
        columns: ['postId', 'userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostLearning',
        index: 'PostLearning_postId_idx_a7a72715',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostLearning',
        index: 'PostLearning_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostReaction',
        index: 'PostReaction_postId_idx_a7a72715',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostReaction',
        index: 'PostReaction_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PostLearning',
        foreignKey: {
          name: 'PostLearning_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'Post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PostLearning',
        foreignKey: {
          name: 'PostLearning_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PostReaction',
        foreignKey: {
          name: 'PostReaction_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'Post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PostReaction',
        foreignKey: {
          name: 'PostReaction_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
