#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/378cec87c4c214ac705068ddeb841130f2c755aa083b7a68c5f2048959e295b0/contract';
import startContract from '../../snapshots/378cec87c4c214ac705068ddeb841130f2c755aa083b7a68c5f2048959e295b0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5c2bee591c5513c8be88956314df8f1480d0620552dbe8bee196622038765312/contract';
import endContract from '../../snapshots/5c2bee591c5513c8be88956314df8f1480d0620552dbe8bee196622038765312/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Notification',
        constraint: 'Notification_type_check_26031f70',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Notification',
        constraint: 'Notification_type_check_d18d54d0',
        expression:
          "\"type\" IN ('POST_CREATED', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'MESSAGE_RECEIVED', 'COMMENT_CREATED')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
