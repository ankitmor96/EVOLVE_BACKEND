
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';


import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EmailModule } from './email/email.module';
import { ProfileModule } from './profile/profile.module';
import { IdentityModule } from './identity/identity.module';
import { SkillModule } from './skill/skill.module';
import { AdminModule } from './admin/admin.module';
import { HomeModule } from './home/home.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { PostsModule } from './posts/posts.module';

import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from './notifications/notifications.module';




@Module({
  imports: [

    // =========================
    // CONFIG
    // =========================

    ConfigModule.forRoot({
      isGlobal: true,
    }),

    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    }),

    NotificationsModule,



    // =========================
    // DATABASE
    // =========================

    PrismaModule,


    // =========================
    // AUTH
    // =========================

    AuthModule,


    EmailModule,


    ProfileModule,


    IdentityModule,


    SkillModule,

    // =========================
    // ADMIN
    // =========================

    AdminModule,

    HomeModule,

    CloudinaryModule,

    PostsModule,
  ],


  controllers: [
    AppController,
  ],


  providers: [
    AppService,
  ],
})
export class AppModule { }

