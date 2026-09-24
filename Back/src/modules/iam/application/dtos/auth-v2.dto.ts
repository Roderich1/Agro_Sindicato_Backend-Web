import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";

export enum RefreshTransportDto {
  COOKIE = "COOKIE",
  BODY = "BODY",
}

export class LoginV2Dto {
  @ApiProperty({ example: "admin@agro.local" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "Admin123!" })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    enum: RefreshTransportDto,
    default: RefreshTransportDto.COOKIE,
    description: "COOKIE para Web; BODY prepara clientes Mobile futuros.",
  })
  @IsOptional()
  @IsEnum(RefreshTransportDto)
  refreshTransport: RefreshTransportDto = RefreshTransportDto.COOKIE;
}

export class RefreshV2Dto {
  @ApiPropertyOptional({
    description: "Refresh opaco V2. Exclusivo del transporte BODY.",
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  refreshToken?: string;
}

export class LogoutV2Dto extends RefreshV2Dto {}

export class BindSessionClientDto {
  @ApiProperty({
    format: "uuid",
    description: "ID central de ClientRegistration.",
  })
  @IsUUID("4")
  registrationId: string;
}
