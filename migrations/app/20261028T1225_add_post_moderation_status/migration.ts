#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5c2bee591c5513c8be88956314df8f1480d0620552dbe8bee196622038765312/contract';
import startContract from '../../snapshots/5c2bee591c5513c8be88956314df8f1480d0620552dbe8bee196622038765312/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7b1789015b91a7a866aa67d6d00c9c3b37c4f2a15729e824e3c67a86be246bbf/contract';
import endContract from '../../snapshots/7b1789015b91a7a866aa67d6d00c9c3b37c4f2a15729e824e3c67a86be246bbf/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Post',
        column: col('moderation_status', 'text', {
          notNull: true,
          default: lit('PENDING'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Post',
        constraint: 'Post_moderation_status_check_22ab0024',
        expression: "\"moderation_status\" IN ('PENDING', 'APPROVED', 'REJECTED', 'REVIEW')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
