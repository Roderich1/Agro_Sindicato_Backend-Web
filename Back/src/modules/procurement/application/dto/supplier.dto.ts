import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ListSuppliersQueryDto {
  @ApiPropertyOptional({ example: 'agroservicios' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class CreateSupplierDto {
  @ApiProperty({ example: 'Agroservicios San Julian' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ApiPropertyOptional({ example: '70000000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: 'San Julian, Santa Cruz' })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  address?: string;

  @ApiPropertyOptional({ example: 'Proveedor de herbicidas y fertilizantes' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'Agroservicios San Julian' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: '70000000' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional({ example: 'San Julian, Santa Cruz' })
  @IsOptional()
  @IsString()
  @MaxLength(220)
  address?: string;

  @ApiPropertyOptional({ example: 'Proveedor de herbicidas y fertilizantes' })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  notes?: string;
}
