#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5576e5ec65ec85a05380d7c4cb19839e4003cbc3b4c2e9fd7b7c8fbcda2704a8/contract';
import endContract from '../../snapshots/5576e5ec65ec85a05380d7c4cb19839e4003cbc3b4c2e9fd7b7c8fbcda2704a8/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ff0be171321cf2ac8baba41901e490492eb52c9e8399274e98a9fd5ba709504b/contract';
import startContract from '../../snapshots/ff0be171321cf2ac8baba41901e490492eb52c9e8399274e98a9fd5ba709504b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('emailVerified', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('phone', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('phoneVerified', 'bool', {
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
      this.addUnique({
        schema: 'public',
        table: 'User',
        constraint: 'User_phone_key',
        columns: ['phone'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
