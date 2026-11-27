
import { ApiLoggingInterceptor } from './api-logging.interceptor';
import { ApiLogsService } from '../../api-logs.service';

describe('ApiLoggingInterceptor', () => {
  let interceptor: ApiLoggingInterceptor;

  const mockApiLogsService = {
    createLog: jest.fn(),
  };

  beforeEach(() => {
    interceptor = new ApiLoggingInterceptor(
      mockApiLogsService as unknown as ApiLogsService,
    );
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });
});
