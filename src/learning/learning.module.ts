import { Module } from '@nestjs/common';
import Redis from 'ioredis';

import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

@Module({
    controllers: [LearningController],

    providers: [
        LearningService,

        {
            provide: 'LEARNING_REDIS',

            useFactory: () => {
                return new Redis({
                    host: process.env.REDIS_HOST || '127.0.0.1',
                    port: Number(process.env.REDIS_PORT) || 6379,
                });
            },
        },
    ],

    exports: [LearningService],
})
export class LearningModule {}