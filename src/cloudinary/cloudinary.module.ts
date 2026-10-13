
import { Module, Global } from '@nestjs/common';
import { CloudinaryProvider } from '../config/cloudinary.config';

@Global()
@Module({
  providers: [CloudinaryProvider],
  exports: [CloudinaryProvider],
})
export class CloudinaryModule {}
