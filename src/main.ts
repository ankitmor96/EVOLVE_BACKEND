
import {
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

import { Temporal } from '@js-temporal/polyfill';

// Make Temporal available globally for Prisma 8 PostgreSQL runtime
(globalThis as any).Temporal = Temporal;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Add /api prefix to all routes
  app.setGlobalPrefix('api');

  // Allow the Vite frontend to call the API directly
  app.enableCors({
    origin:
      app.get(ConfigService).get<string>('FRONTEND_URL') ??
      'http://localhost:5173',
    credentials: true,
  });

  // Global validation with temporary debugging logs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) => {
        console.error(
          'VALIDATION ERRORS:',
          JSON.stringify(
            errors.map((error) => ({
              property: error.property,
              value: error.value,
              constraints: error.constraints,
              target: error.target?.constructor?.name,
            })),
            null,
            2,
          ),
        );

        return new BadRequestException(
          errors.flatMap((error) =>
            Object.values(error.constraints ?? {}),
          ),
        );
      },
    }),
  );

  const port = process.env.PORT || 3000;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 EVOLV backend running on port ${port}`);
}

bootstrap();