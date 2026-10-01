#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract';
import endContract from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5576e5ec65ec85a05380d7c4cb19839e4003cbc3b4c2e9fd7b7c8fbcda2704a8/contract';
import startContract from '../../snapshots/5576e5ec65ec85a05380d7c4cb19839e4003cbc3b4c2e9fd7b7c8fbcda2704a8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropColumn({ schema: 'public', table: 'User', column: 'phoneVerified' }),
      this.dropConstraint({ schema: 'public', table: 'User', constraint: 'User_phone_key' }),
      this.dropColumn({ schema: 'public', table: 'User', column: 'phone' }),
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
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
