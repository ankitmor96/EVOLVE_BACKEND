#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1e6fa45375c3f342455b654bd55ba962b30cea8aeef41defa75e62faef025059/contract';
import startContract from '../../snapshots/1e6fa45375c3f342455b654bd55ba962b30cea8aeef41defa75e62faef025059/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/96066301de4912fc6c061a1c4cdcd682c99e103cd4d91ed4f0f167118f0ea810/contract';
import endContract from '../../snapshots/96066301de4912fc6c061a1c4cdcd682c99e103cd4d91ed4f0f167118f0ea810/contract.json' with { type: 'json' };
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
        table: 'Admin',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lastLoginAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('ADMIN'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression('Admin_role_check_fbe83a19', "\"role\" IN ('SUPER_ADMIN', 'ADMIN')"),
          checkExpression(
            'Admin_status_check_6939929a',
            "\"status\" IN ('ACTIVE', 'INACTIVE', 'BLOCKED')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Admin',
        constraint: 'Admin_email_key',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Admin',
        index: 'Admin_role_idx_2c1ddf83',
        columns: ['role'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Admin',
        index: 'Admin_status_idx_e98638ab',
        columns: ['status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
