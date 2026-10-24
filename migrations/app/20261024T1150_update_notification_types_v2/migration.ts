#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/a6b389ff4c1f5b824a871b910cfc771c19ba2cc94b44127762d187291f33b72f/contract';
import startContract from '../../snapshots/a6b389ff4c1f5b824a871b910cfc771c19ba2cc94b44127762d187291f33b72f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e997e7671e64d5dcfbb139dac6d5f16a825e6cd760ddcb8fb12c98f56f93a15e/contract';
import endContract from '../../snapshots/e997e7671e64d5dcfbb139dac6d5f16a825e6cd760ddcb8fb12c98f56f93a15e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Notification',
        constraint: 'Notification_type_check_0f3d4756',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Notification',
        constraint: 'Notification_type_check_26031f70',
        expression: "\"type\" IN ('POST_CREATED', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED')",
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
