#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/320e9fc433d007e5717bc0e4f554f4681ad54734a5e0b168763d3253cee2833c/contract';
import endContract from '../../snapshots/320e9fc433d007e5717bc0e4f554f4681ad54734a5e0b168763d3253cee2833c/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b86b4e58845b82c28782e02920e90baa0375c52e32aa1bb4ce6fa3f162049ebe/contract';
import startContract from '../../snapshots/b86b4e58845b82c28782e02920e90baa0375c52e32aa1bb4ce6fa3f162049ebe/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Post',
        column: col('moderationRetryCount', 'int4', {
          notNull: true,
          default: lit(0),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Post',
        column: col('nextModerationRetryAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
