#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1e6fa45375c3f342455b654bd55ba962b30cea8aeef41defa75e62faef025059/contract';
import endContract from '../../snapshots/1e6fa45375c3f342455b654bd55ba962b30cea8aeef41defa75e62faef025059/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d2fb03a834ee8730b95f3e37490aeedc4b1fd947f59eb90094918d759bb1014b/contract';
import startContract from '../../snapshots/d2fb03a834ee8730b95f3e37490aeedc4b1fd947f59eb90094918d759bb1014b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'ApiLog',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('endpoint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('executionTime', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('method', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('statusCode', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('userId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApiLog',
        index: 'ApiLog_createdAt_idx_9575dbd7',
        columns: ['createdAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApiLog',
        index: 'ApiLog_endpoint_idx_66e9d4b5',
        columns: ['endpoint'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'ApiLog',
        index: 'ApiLog_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'ApiLog',
        foreignKey: {
          name: 'ApiLog_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
