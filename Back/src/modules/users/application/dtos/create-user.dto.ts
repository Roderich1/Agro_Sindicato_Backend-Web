import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Juan Perez' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'juan.perez@agro.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Contrasena123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty({ enum: UserRole, example: UserRole.AGRICULTOR })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'Confirma explicitamente la creacion de un usuario ADMINISTRADOR.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowAdministrator?: boolean;
}
