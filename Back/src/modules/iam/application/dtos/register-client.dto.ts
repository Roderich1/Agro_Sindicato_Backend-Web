import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class RegisterClientDto {
  @ApiProperty({
    description:
      "UUID v4 canónico y seudónimo generado por la instalación Mobile",
    example: "550e8400-e29b-41d4-a716-446655440000",
    format: "uuid",
  })
  @IsUUID("4")
  clientId!: string;
}
