import { Controller, Get } from '@nestjs/common';
import { Public } from '../modules/iam/api/rest/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'agrochemical-inventory-api',
      timestamp: new Date().toISOString()
    };
  }
}
