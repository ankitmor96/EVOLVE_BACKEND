import { Injectable, OnModuleInit } from '@nestjs/common';

import postgres from '@prisma/orm-postgres/runtime';

import contractJson from '../../prisma/contract.json';

@Injectable()
export class PrismaService implements OnModuleInit {
  private readonly db = postgres({
    contractJson,
    url: process.env.DATABASE_URL!,
  });

  async onModuleInit() {
    await this.db.connect();

    console.log('✅ Database connected successfully');
  }

  get client() {
    return this.db;
  }
}