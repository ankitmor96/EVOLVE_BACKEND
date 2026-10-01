#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract';
import endContract from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ff0be171321cf2ac8baba41901e490492eb52c9e8399274e98a9fd5ba709504b/contract';
import startContract from '../../snapshots/ff0be171321cf2ac8baba41901e490492eb52c9e8399274e98a9fd5ba709504b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'EmailOtp',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('expiresAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('otp', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('emailVerified', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.setDefault({
        schema: 'public',
        table: 'User',
        column: 'updatedAt',
        defaultSql: 'DEFAULT (now())',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
