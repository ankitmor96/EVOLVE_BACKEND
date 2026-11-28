
import { Injectable, BadRequestException, } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiLogExportRow } from './excel-export/excel-export.service';

@Injectable()
export class ApiLogsService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async createLog(data: {
        userId?: number | null;
        method: string;
        endpoint: string;
        statusCode: number;
        executionTime: number;
    }) {
        return this.prisma.client.orm.public.ApiLog.create({
            userId: data.userId ?? null,
            method: data.method,
            endpoint: data.endpoint,
            statusCode: data.statusCode,
            executionTime: data.executionTime,
        });
    }


    async getPaginatedLogs(page = 1, limit = 100) {
        page = Number(page);
        limit = Number(limit);

        if (!Number.isInteger(page) || page < 1) {
            throw new BadRequestException('Invalid page number');
        }

        if (!Number.isInteger(limit) || limit < 1) {
            throw new BadRequestException('Invalid limit');
        }

        limit = Math.min(limit, 100);

        const offset = (page - 1) * limit;

        // Total logs count
        const allLogs = await this.prisma.client.orm.public.ApiLog
            .all();

        const total = allLogs.length;

        // Fetch only current page logs
        const logs = await this.prisma.client.orm.public.ApiLog
            .orderBy((log) => log.createdAt.desc())
            .limit(limit)
            .offset(offset)
            .all();

        const data: ApiLogExportRow[] = logs.map((log) => ({
            id: Number(log.id),
            userId: log.userId === null ? null : Number(log.userId),
            method: String(log.method),
            endpoint: String(log.endpoint),
            statusCode: Number(log.statusCode),
            executionTime: Number(log.executionTime),
            createdAt: new Date(
                Number(
                    (log.createdAt as { epochMilliseconds: number })
                        .epochMilliseconds,
                ),
            ),
        }));

        const totalPages = Math.ceil(total / limit);

        return {
            success: true,
            message: 'API logs fetched successfully',
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
            data,
        };
    }


    async getAllLogs(): Promise<ApiLogExportRow[]> {
        const logs = await this.prisma.client.orm.public.ApiLog
            .orderBy((log) => log.createdAt.desc())
            .all();

        return logs.map((log) => ({
            id: Number(log.id),
            userId: log.userId === null ? null : Number(log.userId),
            method: String(log.method),
            endpoint: String(log.endpoint),
            statusCode: Number(log.statusCode),
            executionTime: Number(log.executionTime),
            createdAt: new Date(
                Number(
                    (log.createdAt as { epochMilliseconds: number })
                        .epochMilliseconds,
                ),
            ),
        }));
    }

    async getLogsForPreviousHour(): Promise<ApiLogExportRow[]> {
        const now = new Date();

        const oneHourAgo = new Date(
            now.getTime() - 60 * 60 * 1000,
        );

        const logs = await this.getAllLogs();

        return logs.filter(
            (log) =>
                log.createdAt >= oneHourAgo &&
                log.createdAt < now,
        );
    }

    async getLogsForPrevious30Minutes(): Promise<ApiLogExportRow[]> {
        const now = new Date();

        const thirtyMinutesAgo = new Date(
            now.getTime() - 30 * 60 * 1000,
        );

        const logs = await this.getAllLogs();

        return logs.filter(
            (log) =>
                log.createdAt >= thirtyMinutesAgo &&
                log.createdAt < now,
        );
    }
}
