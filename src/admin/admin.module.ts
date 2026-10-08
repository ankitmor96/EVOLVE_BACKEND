import { Module } from '@nestjs/common';

import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService],
})
export class AdminModule {}