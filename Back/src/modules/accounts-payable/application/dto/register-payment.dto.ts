import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RegisterPaymentDto {
  @ApiProperty({ example: 150 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  amount: number;

  @ApiPropertyOptional({ example: '2026-05-28' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional({ example: 'Abono parcial realizado en efectivo' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
