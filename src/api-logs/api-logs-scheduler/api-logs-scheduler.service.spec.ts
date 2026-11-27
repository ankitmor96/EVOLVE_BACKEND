import { Test, TestingModule } from '@nestjs/testing';
import { ApiLogsSchedulerService } from './api-logs-scheduler.service';

describe('ApiLogsSchedulerService', () => {
  let service: ApiLogsSchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiLogsSchedulerService],
    }).compile();

    service = module.get<ApiLogsSchedulerService>(ApiLogsSchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
