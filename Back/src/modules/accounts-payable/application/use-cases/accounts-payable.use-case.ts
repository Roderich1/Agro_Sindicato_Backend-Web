import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PayableStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/shared/infrastructure/persistence/prisma/prisma.service';
import { ListPayablesQueryDto } from '../dto/list-payables-query.dto';
import { RegisterPaymentDto } from '../dto/register-payment.dto';

@Injectable()
export class AccountsPayableUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, userId: string, query: ListPayablesQueryDto) {
    await this.markOverdue(tenantId, userId);

    const payables = await this.prisma.payableAccount.findMany({
      where: {
        tenantId,
        responsibleUserId: userId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.supplierId
          ? { purchase: { supplierId: query.supplierId } }
          : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        purchase: { include: { supplier: true, items: { include: { product: true } } } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });

    return payables.map((payable) => this.mapPayable(payable));
  }

  async registerPayment(
    tenantId: string,
    userId: string,
    payableId: string,
    dto: RegisterPaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const payable = await tx.payableAccount.findFirst({
        where: { id: payableId, tenantId, responsibleUserId: userId },
        include: { purchase: { include: { supplier: true } } },
      });

      if (!payable) {
        throw new NotFoundException('La cuenta por pagar no existe para este agricultor.');
      }

      const amount = new Prisma.Decimal(dto.amount.toString());
      const balance = payable.totalAmount.minus(payable.paidAmount);

      if (payable.status === PayableStatus.PAGADA) {
        throw new BadRequestException('La cuenta ya se encuentra pagada.');
      }

      if (amount.greaterThan(balance)) {
        throw new BadRequestException(`El abono excede el saldo pendiente: ${balance.toString()}.`);
      }

      const maxPaidAmountBeforePayment = payable.totalAmount.minus(amount);
      const reserved = await tx.payableAccount.updateMany({
        where: {
          id: payable.id,
          tenantId,
          responsibleUserId: userId,
          status: { not: PayableStatus.PAGADA },
          paidAmount: { lte: maxPaidAmountBeforePayment },
        },
        data: {
          paidAmount: { increment: amount },
        },
      });

      if (reserved.count !== 1) {
        throw new BadRequestException(
          'El abono excede el saldo pendiente. La cuenta fue actualizada por otra operacion, vuelve a intentarlo.',
        );
      }

      const payableAfterPayment = await tx.payableAccount.findUniqueOrThrow({
        where: { id: payable.id },
        select: { totalAmount: true, paidAmount: true, dueDate: true },
      });
      const status = this.resolveStatus(
        payableAfterPayment.totalAmount,
        payableAfterPayment.paidAmount,
        payableAfterPayment.dueDate,
      );

      const payment = await tx.payment.create({
        data: {
          tenantId,
          payableAccountId: payable.id,
          registeredById: userId,
          amount,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          notes: dto.notes,
        },
      });

      const updated = await tx.payableAccount.update({
        where: { id: payable.id },
        data: {
          status,
        },
        include: {
          purchase: { include: { supplier: true, items: { include: { product: true } } } },
          payments: { orderBy: { paidAt: 'desc' } },
        },
      });

      return {
        message: status === PayableStatus.PAGADA ? 'Cuenta pagada completamente.' : 'Abono registrado correctamente.',
        payment: {
          id: payment.id,
          amount: payment.amount.toString(),
          paidAt: payment.paidAt.toISOString(),
          notes: payment.notes,
        },
        payable: this.mapPayable(updated),
      };
    });
  }

  async payTotal(tenantId: string, userId: string, payableId: string, notes?: string) {
    const payable = await this.prisma.payableAccount.findFirst({
      where: { id: payableId, tenantId, responsibleUserId: userId },
    });

    if (!payable) {
      throw new NotFoundException('La cuenta por pagar no existe para este agricultor.');
    }

    const balance = payable.totalAmount.minus(payable.paidAmount);
    if (balance.lessThanOrEqualTo(0)) {
      throw new BadRequestException('La cuenta ya se encuentra pagada.');
    }

    return this.registerPayment(tenantId, userId, payableId, {
      amount: Number(balance.toString()),
      notes,
    });
  }

  private async markOverdue(tenantId: string, userId: string) {
    await this.prisma.payableAccount.updateMany({
      where: {
        tenantId,
        responsibleUserId: userId,
        status: { in: [PayableStatus.PENDIENTE, PayableStatus.PARCIAL] },
        dueDate: { lt: new Date() },
      },
      data: { status: PayableStatus.VENCIDA },
    });
  }

  private resolveStatus(total: Prisma.Decimal, paid: Prisma.Decimal, dueDate: Date) {
    if (paid.greaterThanOrEqualTo(total)) return PayableStatus.PAGADA;
    if (dueDate.getTime() < Date.now()) return PayableStatus.VENCIDA;
    if (paid.greaterThan(0)) return PayableStatus.PARCIAL;
    return PayableStatus.PENDIENTE;
  }

  private mapPayable(payable: {
    id: string;
    dueDate: Date;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    status: PayableStatus;
    createdAt: Date;
    updatedAt: Date;
    purchase: {
      id: string;
      supplier: { id: string; name: string; phone: string | null };
      items?: {
        id: string;
        quantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        product: { id: string; name: string; unit: string };
      }[];
    };
    payments?: {
      id: string;
      amount: Prisma.Decimal;
      paidAt: Date;
      notes: string | null;
    }[];
  }) {
    const balance = payable.totalAmount.minus(payable.paidAmount);
    return {
      id: payable.id,
      purchaseId: payable.purchase.id,
      supplier: payable.purchase.supplier,
      dueDate: payable.dueDate.toISOString(),
      totalAmount: payable.totalAmount.toString(),
      paidAmount: payable.paidAmount.toString(),
      balance: balance.toString(),
      status: payable.status,
      createdAt: payable.createdAt.toISOString(),
      updatedAt: payable.updatedAt.toISOString(),
      items:
        payable.purchase.items?.map((item) => ({
          id: item.id,
          product: item.product,
          quantity: item.quantity.toString(),
          unitCost: item.unitCost.toString(),
          subtotal: item.subtotal.toString(),
        })) ?? [],
      payments:
        payable.payments?.map((payment) => ({
          id: payment.id,
          amount: payment.amount.toString(),
          paidAt: payment.paidAt.toISOString(),
          notes: payment.notes,
        })) ?? [],
    };
  }
}
