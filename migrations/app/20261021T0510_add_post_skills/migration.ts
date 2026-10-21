#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a6b389ff4c1f5b824a871b910cfc771c19ba2cc94b44127762d187291f33b72f/contract';
import endContract from '../../snapshots/a6b389ff4c1f5b824a871b910cfc771c19ba2cc94b44127762d187291f33b72f/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e0ca46b37127617ba31e733dd7f06d007718d3dd0ded91ee6fdce4a3ecd49d8c/contract';
import startContract from '../../snapshots/e0ca46b37127617ba31e733dd7f06d007718d3dd0ded91ee6fdce4a3ecd49d8c/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'PostSkill',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('postId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('relationshipType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('skillId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'PostSkill_relationshipType_check_d13d0d3b',
            "\"relationshipType\" IN ('CAN_DO', 'LEARNING', 'WANT_TO_IMPROVE')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'PostSkill',
        constraint: 'PostSkill_postId_skillId_relationshipType_key',
        columns: ['postId', 'skillId', 'relationshipType'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostSkill',
        index: 'PostSkill_postId_idx_a7a72715',
        columns: ['postId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'PostSkill',
        index: 'PostSkill_skillId_idx_6e19993d',
        columns: ['skillId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PostSkill',
        foreignKey: {
          name: 'PostSkill_postId_fkey',
          columns: ['postId'],
          references: { schema: 'public', table: 'Post', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'PostSkill',
        foreignKey: {
          name: 'PostSkill_skillId_fkey',
          columns: ['skillId'],
          references: { schema: 'public', table: 'Skill', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
