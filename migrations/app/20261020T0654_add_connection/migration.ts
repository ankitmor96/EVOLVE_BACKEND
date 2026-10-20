#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/39449dee6a22fac11fe2b4a3cc35c29789b76908371f5e46f658c6054caac0cf/contract';
import startContract from '../../snapshots/39449dee6a22fac11fe2b4a3cc35c29789b76908371f5e46f658c6054caac0cf/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e0ca46b37127617ba31e733dd7f06d007718d3dd0ded91ee6fdce4a3ecd49d8c/contract';
import endContract from '../../snapshots/e0ca46b37127617ba31e733dd7f06d007718d3dd0ded91ee6fdce4a3ecd49d8c/contract.json' with { type: 'json' };
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
        table: 'Connection',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('receiverId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('requesterId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Connection_status_check_904c6455',
            "\"status\" IN ('PENDING', 'ACCEPTED', 'REJECTED')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'Connection',
        constraint: 'Connection_requesterId_receiverId_key',
        columns: ['requesterId', 'receiverId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Connection',
        index: 'Connection_receiverId_idx_fe124f44',
        columns: ['receiverId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Connection',
        index: 'Connection_receiverId_status_idx_1f8f1a2b',
        columns: ['receiverId', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Connection',
        index: 'Connection_requesterId_idx_a5f4af92',
        columns: ['requesterId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Connection',
        index: 'Connection_requesterId_status_idx_d3ddea37',
        columns: ['requesterId', 'status'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Connection',
        foreignKey: {
          name: 'Connection_requesterId_fkey',
          columns: ['requesterId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Connection',
        foreignKey: {
          name: 'Connection_receiverId_fkey',
          columns: ['receiverId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
