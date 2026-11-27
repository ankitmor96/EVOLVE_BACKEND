import { Test, TestingModule } from '@nestjs/testing';
import { ExcelExportService } from './excel-export.service';

describe('ExcelExportService', () => {
  let service: ExcelExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExcelExportService],
    }).compile();

    service = module.get<ExcelExportService>(ExcelExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
