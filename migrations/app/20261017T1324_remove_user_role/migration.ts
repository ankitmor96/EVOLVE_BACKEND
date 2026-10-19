#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/25dfd7d47aca9e5bbb77b5ee008888a3e0f52d3c4dcae30bb52f631e51b48824/contract';
import endContract from '../../snapshots/25dfd7d47aca9e5bbb77b5ee008888a3e0f52d3c4dcae30bb52f631e51b48824/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/60c950e73da7f8806c2b3d3082358d343440d6bb8e761488ff3a1de5b4ad0965/contract';
import startContract from '../../snapshots/60c950e73da7f8806c2b3d3082358d343440d6bb8e761488ff3a1de5b4ad0965/contract.json' with { type: 'json' };
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
      this.dropColumn({ schema: 'public', table: 'User', column: 'role' }),
      this.createTable({
        schema: 'public',
        table: 'Notification',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('isRead', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('message', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('Notification_type_check_0f3d4756', '"type" IN (\'POST_CREATED\')'),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Notification',
        index: 'Notification_userId_isRead_idx_b0140cd3',
        columns: ['userId', 'isRead'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
