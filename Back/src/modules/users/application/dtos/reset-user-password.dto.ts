import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetUserPasswordDto {
  @ApiProperty({ example: 'NuevaContrasena123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
