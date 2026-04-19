import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'TicketShop SY Backend API (NestJS)';
  }
}
