#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0b58a3ff60da679871331f9e880332ee1cf99cd7cae9e7d87e3f4540d0ae16b2/contract';
import endContract from '../../snapshots/0b58a3ff60da679871331f9e880332ee1cf99cd7cae9e7d87e3f4540d0ae16b2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/320e9fc433d007e5717bc0e4f554f4681ad54734a5e0b168763d3253cee2833c/contract';
import startContract from '../../snapshots/320e9fc433d007e5717bc0e4f554f4681ad54734a5e0b168763d3253cee2833c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'UserSkillPoint',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('points', 'numeric', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1' },
          }),
          col('skillId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('userId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'UserSkillPoint',
        constraint: 'UserSkillPoint_userId_skillId_key',
        columns: ['userId', 'skillId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserSkillPoint',
        index: 'UserSkillPoint_skillId_idx_6e19993d',
        columns: ['skillId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'UserSkillPoint',
        index: 'UserSkillPoint_userId_idx_a489d58a',
        columns: ['userId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserSkillPoint',
        foreignKey: {
          name: 'UserSkillPoint_userId_fkey',
          columns: ['userId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'UserSkillPoint',
        foreignKey: {
          name: 'UserSkillPoint_skillId_fkey',
          columns: ['skillId'],
          references: { schema: 'public', table: 'Skill', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
