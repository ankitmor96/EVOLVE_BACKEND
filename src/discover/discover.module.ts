
import { Module } from '@nestjs/common';

import { DiscoverController } from './discover.controller';
import { DiscoverService } from './discover.service';

import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [
    ConnectionsModule,
  ],
  controllers: [
    DiscoverController,
  ],
  providers: [
    DiscoverService,
  ],
})
export class DiscoverModule {}
