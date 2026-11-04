#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b2e2608da1801eb7229d60dc6de12a94cd310de67275ae937fe12ddeb586e29b/contract';
import startContract from '../../snapshots/b2e2608da1801eb7229d60dc6de12a94cd310de67275ae937fe12ddeb586e29b/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b86b4e58845b82c28782e02920e90baa0375c52e32aa1bb4ce6fa3f162049ebe/contract';
import endContract from '../../snapshots/b86b4e58845b82c28782e02920e90baa0375c52e32aa1bb4ce6fa3f162049ebe/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'PostSkill',
        constraint: 'PostSkill_relationshipType_check_d13d0d3b',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'PostSkill',
        constraint: 'PostSkill_postId_skillId_relationshipType_key',
      }),
      this.dropColumn({ schema: 'public', table: 'PostSkill', column: 'relationshipType' }),
      this.addUnique({
        schema: 'public',
        table: 'PostSkill',
        constraint: 'PostSkill_postId_skillId_key',
        columns: ['postId', 'skillId'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
