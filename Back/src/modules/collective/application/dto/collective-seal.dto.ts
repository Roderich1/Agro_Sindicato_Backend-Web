import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, Matches } from "class-validator";

/** F07 manual seal: explicit confirmation of what was reviewed. */
export class SealCampaignDto {
  @ApiProperty({ description: "Confirmación explícita de quien sella (DIRECTIVA o ADMINISTRADOR)" })
  @IsBoolean()
  confirmed!: boolean;

  @ApiProperty({ pattern: "^[0-9a-f]{64}$", description: "review_ref de la revisión mostrada (GET …/seal)" })
  @Matches(/^[0-9a-f]{64}$/)
  review_ref!: string;
}

export class TrendsQueryDto {
  @ApiPropertyOptional({ enum: ["CONSUMPTION_TOTAL", "DECLARED_NEED"] })
  @IsOptional()
  @IsIn(["CONSUMPTION_TOTAL", "DECLARED_NEED"])
  projection_type?: "CONSUMPTION_TOTAL" | "DECLARED_NEED";
}
