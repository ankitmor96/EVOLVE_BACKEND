import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryProvider } from '../config/cloudinary.config';

@Module({
  imports: [PrismaModule],
  controllers: [ProfileController],
  providers: [ProfileService,CloudinaryProvider],
  
})
export class ProfileModule {}