#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract';
import endContract from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b0000ef0a017f0a64b638470e5f44551a8435fc9870d7c7c963da860d28d129a/contract';
import startContract from '../../snapshots/b0000ef0a017f0a64b638470e5f44551a8435fc9870d7c7c963da860d28d129a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [this.dropTable({ schema: 'public', table: 'EvolvProfile' })];
  }
}

MigrationCLI.run(import.meta.url, M);
