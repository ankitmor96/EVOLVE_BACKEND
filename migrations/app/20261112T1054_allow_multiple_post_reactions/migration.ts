#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0507416b6a1d073c29323bf94d7ad95b2793a74b40ab47f3e7f345952033aceb/contract';
import endContract from '../../snapshots/0507416b6a1d073c29323bf94d7ad95b2793a74b40ab47f3e7f345952033aceb/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/0b58a3ff60da679871331f9e880332ee1cf99cd7cae9e7d87e3f4540d0ae16b2/contract';
import startContract from '../../snapshots/0b58a3ff60da679871331f9e880332ee1cf99cd7cae9e7d87e3f4540d0ae16b2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'PostReaction',
        constraint: 'PostReaction_postId_userId_key',
      }),
      this.addUnique({
        schema: 'public',
        table: 'PostReaction',
        constraint: 'PostReaction_postId_userId_reactionType_key',
        columns: ['postId', 'userId', 'reactionType'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
