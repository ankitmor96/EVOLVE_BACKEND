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
    try {
      console.log('Checking database connection...');
      console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);

      await this.db.connect();

      console.log('Database connected successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);

      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error cause:', error.cause);
        console.error('Error stack:', error.stack);
      }

      throw error;
    }
  }

  get client() {
    return this.db;
  }
}