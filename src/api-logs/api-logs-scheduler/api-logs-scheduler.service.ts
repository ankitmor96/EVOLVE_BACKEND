
import {
    Injectable,
    Logger,
} from '@nestjs/common';

import { Cron, CronExpression } from '@nestjs/schedule';

import * as fs from 'fs/promises';
import * as path from 'path';

import { ApiLogsService } from '../api-logs.service';
import { ExcelExportService } from '../excel-export/excel-export.service';

@Injectable()
export class ApiLogsSchedulerService {
    private readonly logger = new Logger(ApiLogsSchedulerService.name);

    constructor(
        private readonly apiLogsService: ApiLogsService,
        private readonly excelExportService: ExcelExportService,
    ) { }

    @Cron(CronExpression.EVERY_30_MINUTES, {
        timeZone: 'Asia/Kolkata',
    })

    async generateHourlyExcel(): Promise<void> {
        try {
            this.logger.log('Hourly API logs Excel generation started');

            this.logger.log('Current time: ' + new Date().toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
            }));

            const logs = await this.apiLogsService.getLogsForPrevious30Minutes();

            if (logs.length === 0) {
                this.logger.log('No API logs available for Excel export');
                return;
            }

            const excelBuffer =
                await this.excelExportService.generateExcel(logs);

            const storageDirectory =
                process.env.API_LOGS_STORAGE_PATH ||
                path.join(process.cwd(), 'storage', 'api-logs');

            await fs.mkdir(storageDirectory, { recursive: true });

            const timestamp = new Date()
                .toISOString()
                .replace(/[:.]/g, '-');

            const fileName = `api-logs-${timestamp}.xlsx`;

            const filePath = path.join(storageDirectory, fileName);

            await fs.writeFile(filePath, excelBuffer);

            this.logger.log(`Excel file saved: ${filePath}`);
        } catch (error) {
            this.logger.error(
                'Hourly API logs Excel generation failed',
                error instanceof Error ? error.stack : String(error),
            );
        }
    }
}
