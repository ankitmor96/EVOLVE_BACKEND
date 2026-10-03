#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract';
import startContract from '../../snapshots/0e1b7b6c20a06fc07710d1b6d93f31f9358eeef3a01a89f1ba524200eac4c484/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b0000ef0a017f0a64b638470e5f44551a8435fc9870d7c7c963da860d28d129a/contract';
import endContract from '../../snapshots/b0000ef0a017f0a64b638470e5f44551a8435fc9870d7c7c963da860d28d129a/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'EvolvProfile',
        columns: [
          col('ageRange', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('completedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('country', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('curiositySkills', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('focusAreas', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('focusSubAreas', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('profileCompleted', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('profilePhoto', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('roles', 'text[]', { notNull: true, codecRef: { codecId: 'pg/text@1', many: true } }),
          col('skillsCanDo', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('skillsLearning', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('skillsToImprove', 'text[]', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1', many: true },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('username', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('workingToward', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'EvolvProfile_ageRange_check_e9d011da',
            "\"ageRange\" IN ('UNDER_18', 'AGE_18_24', 'AGE_25_34', 'AGE_35_44', 'AGE_45_PLUS')",
          ),
          checkExpression(
            'EvolvProfile_curiositySkills_elem_not_null_64d06193',
            'array_position("curiositySkills", NULL) IS NULL',
          ),
          checkExpression(
            'EvolvProfile_focusAreas_elem_not_null_222c8e05',
            'array_position("focusAreas", NULL) IS NULL',
          ),
          checkExpression(
            'EvolvProfile_focusSubAreas_elem_not_null_c824ac98',
            'array_position("focusSubAreas", NULL) IS NULL',
          ),
          checkExpression(
            'EvolvProfile_roles_elem_not_null_37524d49',
            'array_position("roles", NULL) IS NULL',
          ),
          checkExpression(
            'EvolvProfile_skillsCanDo_elem_not_null_950c80fb',
            'array_position("skillsCanDo", NULL) IS NULL',
          ),
          checkExpression(
            'EvolvProfile_skillsLearning_elem_not_null_cf15a663',
            'array_position("skillsLearning", NULL) IS NULL',
          ),
          checkExpression(
            'EvolvProfile_skillsToImprove_elem_not_null_96353631',
            'array_position("skillsToImprove", NULL) IS NULL',
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'EvolvProfile',
        constraint: 'EvolvProfile_userId_key',
        columns: ['userId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'EvolvProfile',
        constraint: 'EvolvProfile_username_key',
        columns: ['username'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'EvolvProfile',
        foreignKey: {
          name: 'EvolvProfile_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
