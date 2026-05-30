import { Body, Controller, Get, Logger, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../../iam/api/rest/decorators/current-user.decorator';
import { Roles } from '../../../iam/api/rest/decorators/roles.decorator';
import { JwtPayload } from '../../../iam/application/types/jwt-payload.type';
import { ListPayablesQueryDto } from '../../application/dto/list-payables-query.dto';
import { RegisterPaymentDto } from '../../application/dto/register-payment.dto';
import { AccountsPayableUseCase } from '../../application/use-cases/accounts-payable.use-case';

@ApiTags('accounts-payable')
@ApiBearerAuth()
@Roles(UserRole.AGRICULTOR, UserRole.DIRECTIVA, UserRole.ADMINISTRADOR)
@Controller('accounts-payable')
export class AccountsPayableController {
  private readonly logger = new Logger(AccountsPayableController.name);

  constructor(private readonly accountsPayableUseCase: AccountsPayableUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Listar cuentas por pagar del agricultor autenticado' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListPayablesQueryDto) {
    return this.accountsPayableUseCase.list(user.tenantId, user.sub, query);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Registrar abono parcial o total' })
  async registerPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RegisterPaymentDto,
  ) {
    this.logger.log(`[PAYABLE PAYMENT] userId=${user.sub} tenantId=${user.tenantId} payableId=${id}`);
    return this.accountsPayableUseCase.registerPayment(user.tenantId, user.sub, id, dto);
  }

  @Post(':id/pay-total')
  @ApiOperation({ summary: 'Registrar pago total del saldo pendiente' })
  async payTotal(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { notes?: string },
  ) {
    this.logger.log(`[PAYABLE PAY_TOTAL] userId=${user.sub} tenantId=${user.tenantId} payableId=${id}`);
    return this.accountsPayableUseCase.payTotal(user.tenantId, user.sub, id, body.notes);
  }
}
