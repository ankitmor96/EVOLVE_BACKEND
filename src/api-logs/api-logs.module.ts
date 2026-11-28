
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from '../prisma/prisma.module';
import { ApiLogsService } from './api-logs.service';
import { ApiLoggingInterceptor } from './interceptors/api-logging/api-logging.interceptor';
import { ExcelExportService } from './excel-export/excel-export.service';
import { ApiLogsSchedulerService } from './api-logs-scheduler/api-logs-scheduler.service';
import { ApiLogsController } from './api-logs.controller';


@Module({
  imports: [PrismaModule],

  controllers: [
    ApiLogsController,
  ],

  providers: [
    ApiLogsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiLoggingInterceptor,
    },
    ExcelExportService,
    ApiLogsSchedulerService,
  ],

  exports: [ApiLogsService],
})
export class ApiLogsModule { }
