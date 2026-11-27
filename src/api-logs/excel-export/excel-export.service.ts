
import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export interface ApiLogExportRow {
  id: number;
  userId: number | null;
  method: string;
  endpoint: string;
  statusCode: number;
  executionTime: number;
  createdAt: Date;
}

@Injectable()
export class ExcelExportService {

  async generateExcel(logs: ApiLogExportRow[]): Promise<Buffer> {

    const workbook = new ExcelJS.Workbook();

    workbook.creator = 'EVOLV';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('API Logs');

    worksheet.columns = [
      { header: 'Log ID', key: 'id', width: 12 },
      { header: 'User ID', key: 'userId', width: 12 },
      { header: 'HTTP Method', key: 'method', width: 16 },
      { header: 'API Endpoint', key: 'endpoint', width: 40 },
      { header: 'Status Code', key: 'statusCode', width: 15 },
      { header: 'Execution Time (ms)', key: 'executionTime', width: 22 },
      { header: 'India Date & Time', key: 'createdAt', width: 25 },
    ];

    worksheet.getRow(1).font = {
      bold: true,
    };

    for (const log of logs) {
      worksheet.addRow({
        id: log.id,
        userId: log.userId ?? 'Guest',
        method: log.method,
        endpoint: log.endpoint,
        statusCode: log.statusCode,
        executionTime: log.executionTime,
        createdAt: new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'medium',
        }).format(new Date(log.createdAt)),
      });
    }

    worksheet.views = [
      { state: 'frozen', ySplit: 1 },
    ];

    const buffer = await workbook.xlsx.writeBuffer();

    return Buffer.from(buffer);
  }
}
