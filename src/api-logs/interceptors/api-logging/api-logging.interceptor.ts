
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';

import { Observable, tap } from 'rxjs';

import { Request, Response } from 'express';

import { ApiLogsService } from '../../api-logs.service';

@Injectable()
export class ApiLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ApiLoggingInterceptor.name);

  constructor(
    private readonly apiLogsService: ApiLogsService,
  ) { }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {

    const httpContext = context.switchToHttp();

    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const startTime = Date.now();

    const method = request.method;
    const endpoint = request.originalUrl;

    const userId =
      (request as Request & { user?: { userId?: number } }).user?.userId ?? null;

    const currentTime = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
    });

    const saveLog = async (statusCode: number) => {
      const executionTime = Date.now() - startTime;

      const logData = {
        userId,
        method,
        endpoint,
        statusCode,
        executionTime,
      };

      this.logger.log(
        JSON.stringify({
          time: currentTime,
          ...logData,
        }),
      );

      try {
        await this.apiLogsService.createLog(logData);
      } catch (error) {
        this.logger.error(
          'Failed to save API log to database',
          error instanceof Error ? error.stack : String(error),
        );
      }
    };

    return next.handle().pipe(
      tap({
        next: () => {
          void saveLog(response.statusCode);
        },

        error: (error) => {
          const statusCode =
            typeof error.getStatus === 'function'
              ? error.getStatus()
              : error.status || 500;

          void saveLog(statusCode);
        },
      }),
    );
  }
}
