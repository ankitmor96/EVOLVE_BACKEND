
import {
    Controller,
    Get,
    Query,
} from '@nestjs/common';

import { ApiLogsService } from './api-logs.service';

@Controller('api-logs')
export class ApiLogsController {
    constructor(
        private readonly apiLogsService: ApiLogsService,
    ) { }


    @Get()
    async getAllLogs(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.apiLogsService.getPaginatedLogs(
            page ? Number(page) : 1,
            limit ? Number(limit) : 100,
        );
    }

}
