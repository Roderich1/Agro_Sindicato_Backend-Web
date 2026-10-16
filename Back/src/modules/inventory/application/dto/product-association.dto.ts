import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsString, IsUUID, MaxLength } from "class-validator";

/** Associate (or correct) a denomination with its canonical product. */
export class AssociateProductDto {
  @ApiProperty({ format: "uuid", description: "Denominación del catálogo central" })
  @IsUUID()
  productId!: string;

  @ApiProperty({ format: "uuid", description: "Producto canónico (no puede ser alias)" })
  @IsUUID()
  canonicalProductId!: string;

  @ApiProperty({ maxLength: 280 })
  @IsString()
  @MaxLength(280)
  reason!: string;

  @ApiProperty({ description: "Confirmación explícita de la Directiva (RF-33)" })
  @IsBoolean()
  confirmed!: boolean;
}

/** Close the current association: the product is its own canonical again. */
export class CloseProductAssociationDto {
  @ApiProperty({ maxLength: 280 })
  @IsString()
  @MaxLength(280)
  reason!: string;

  @ApiProperty()
  @IsBoolean()
  confirmed!: boolean;
}
