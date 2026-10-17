#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/60c950e73da7f8806c2b3d3082358d343440d6bb8e761488ff3a1de5b4ad0965/contract';
import endContract from '../../snapshots/60c950e73da7f8806c2b3d3082358d343440d6bb8e761488ff3a1de5b4ad0965/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/757f866c81994f7be445a65ba3c2b5543720a98e7ab645e871b230a876c46318/contract';
import startContract from '../../snapshots/757f866c81994f7be445a65ba3c2b5543720a98e7ab645e871b230a876c46318/contract.json' with { type: 'json' };
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
        table: 'Post',
        columns: [
          col('caption', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('deletedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postKind', 'text', {
            notNull: true,
            default: lit('GENERAL'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('postType', 'text', {
            notNull: true,
            default: lit('TEXT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('publishedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('visibility', 'text', {
            notNull: true,
            default: lit('PUBLIC'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Post_postKind_check_53244310',
            "\"postKind\" IN ('GENERAL', 'QUESTION', 'PROJECT', 'TUTORIAL')",
          ),
          checkExpression(
            'Post_postType_check_07bbca23',
            "\"postType\" IN ('TEXT', 'IMAGE', 'VIDEO', 'MIXED', 'POLL')",
          ),
          checkExpression(
            'Post_status_check_bc64f66b',
            "\"status\" IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')",
          ),
          checkExpression(
            'Post_visibility_check_7e49735a',
            "\"visibility\" IN ('PUBLIC', 'CONNECTIONS', 'PRIVATE')",
          ),
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'PostMedia',
        columns: [
          col('altText', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('mediaType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('mediaUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('metadata', 'json', { codecRef: { codecId: 'pg/json@1' } }),
          col('position', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('thumbnailUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'PostMedia_mediaType_check_cdf8f30c',
            "\"mediaType\" IN ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT')",
          ),
        ],
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('role', 'text', { default: lit('USER'), codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'Post',
        index: 'Post_status_publishedAt_idx_4d4b1960',
        columns: ['status', 'publishedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Post',
        index: 'Post_userId_createdAt_idx_f726f04a',
        columns: ['userId', 'createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Post',
        index: 'Post_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostMedia',
        index: 'PostMedia_postId_idx_a7a72715',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostMedia',
        index: 'PostMedia_postId_position_idx_89272d53',
        columns: ['postId', 'position'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Post',
        foreignKey: {
          name: 'Post_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PostMedia',
        foreignKey: {
          name: 'PostMedia_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'Post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
