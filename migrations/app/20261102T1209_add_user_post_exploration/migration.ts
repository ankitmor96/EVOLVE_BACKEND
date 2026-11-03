#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/27c096708602b4d9c830ecb89d4697f16220f9fe1bccb92b91f69f517359c096/contract';
import startContract from '../../snapshots/27c096708602b4d9c830ecb89d4697f16220f9fe1bccb92b91f69f517359c096/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b2e2608da1801eb7229d60dc6de12a94cd310de67275ae937fe12ddeb586e29b/contract';
import endContract from '../../snapshots/b2e2608da1801eb7229d60dc6de12a94cd310de67275ae937fe12ddeb586e29b/contract.json' with { type: 'json' };
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
        table: 'UserPostExploration',
        columns: [
          col('contentType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('explorationCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('firstExploredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastExploredAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('maxCompletionPercentage', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('totalConsumptionSeconds', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
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
            'UserPostExploration_contentType_check_166440cd',
            "\"contentType\" IN ('VIDEO', 'TEXT', 'IMAGE', 'LONG_FORM')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'UserPostExploration',
        constraint: 'UserPostExploration_userId_postId_key',
        columns: ['userId', 'postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserPostExploration',
        index: 'UserPostExploration_firstExploredAt_idx_4a0c2b9f',
        columns: ['firstExploredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserPostExploration',
        index: 'UserPostExploration_postId_idx_a7a72715',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserPostExploration',
        index: 'UserPostExploration_userId_firstExploredAt_idx_1d9311f7',
        columns: ['userId', 'firstExploredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserPostExploration',
        index: 'UserPostExploration_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserPostExploration',
        foreignKey: {
          name: 'UserPostExploration_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserPostExploration',
        foreignKey: {
          name: 'UserPostExploration_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'Post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
