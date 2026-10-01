
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { createObserveModule } from '@nestjs/observe';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';


export const {
  ObserveModule,
  ObserveInstrument,
} = createObserveModule();


@Module({
  imports: [

    // =========================
    // CONFIG
    // =========================

    ConfigModule.forRoot({
      isGlobal: true,
    }),


    // =========================
    // OBSERVE
    // =========================

    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY!,
      appSecret: process.env.OBSERVE_APP_SECRET!,
      serviceId:
        process.env.OBSERVE_SERVICE_ID ||
        'evolve_backend',
    }),


    // =========================
    // DATABASE
    // =========================

    PrismaModule,


    // =========================
    // AUTH
    // =========================

    AuthModule,


    EmailModule,
  ],


  controllers: [
    AppController,
  ],


  providers: [
    AppService,
  ],
})
export class AppModule {}

