import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import {
  BindSessionClientDto,
  LoginV2Dto,
  LogoutV2Dto,
  RefreshTransportDto,
  RefreshV2Dto,
} from "../../application/dtos/auth-v2.dto";
import { AuthV2Service } from "../../application/services/auth-v2.service";
import { AuthTtlPolicy } from "../../application/services/auth-ttl-policy";
import { AuthenticatedPrincipal } from "../../application/types/authenticated-principal.type";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Public } from "./decorators/public.decorator";
import { v2AuthResponseSchema } from "./auth-openapi.schemas";

const V2_REFRESH_COOKIE = "refresh_token_v2";
const V2_COOKIE_PATH = "/api/v1/auth/v2";

function cookieOptions(maxAge: number) {
  const secure =
    process.env["COOKIE_SECURE"] === "true" ||
    (process.env["COOKIE_SECURE"] !== "false" &&
      process.env["NODE_ENV"] === "production");
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: V2_COOKIE_PATH,
    maxAge,
  };
}

export function selectCredential(req: Request, bodyToken?: string) {
  const cookieToken = (req.cookies as Record<string, string | undefined>)[
    V2_REFRESH_COOKIE
  ];
  if (cookieToken && bodyToken) {
    throw new BadRequestException(
      "Use refresh V2 por cookie o body, nunca ambos simultáneamente.",
    );
  }
  return bodyToken
    ? { token: bodyToken, source: "BODY" as const }
    : { token: cookieToken, source: "COOKIE" as const };
}

@ApiTags("auth v2")
@Controller("auth/v2")
export class AuthV2Controller {
  constructor(
    private readonly auth: AuthV2Service,
    private readonly ttl: AuthTtlPolicy,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 400, description: "DTO o transporte invalido." })
  @ApiResponse({ status: 429, description: "Limite de intentos excedido." })
  @ApiOperation({
    summary: "Iniciar una sesión auth V2",
    description:
      "Contrato versionado 2. COOKIE es el transporte Web por defecto; BODY prepara clientes Mobile futuros.",
  })
  @ApiResponse({ status: 200, description: "Sesión V2 creada.", schema: v2AuthResponseSchema })
  @ApiUnauthorizedResponse({
    description: "Credenciales o contexto inactivos.",
  })
  async login(
    @Body() dto: LoginV2Dto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(
      dto,
      req.ip,
      req.headers["user-agent"],
    );
    if (result.refreshTransport === RefreshTransportDto.COOKIE) {
      res.cookie(
        V2_REFRESH_COOKIE,
        result.rawRefreshToken,
        cookieOptions(this.ttl.remainingSessionMs(result.sessionExpiresAt)),
      );
    }
    return this.publicResult(result);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: 200, description: "Access V2 y refresh rotado; COOKIE usa refresh_token_v2 HttpOnly, BODY devuelve refreshToken.", schema: v2AuthResponseSchema })
  @ApiResponse({ status: 400, description: "Cookie y body simultaneos o DTO invalido." })
  @ApiOperation({
    summary: "Rotar refresh V2 atómicamente",
    description:
      "Acepta refresh_token_v2 para COOKIE o refreshToken para BODY. Rechaza ambigüedad y mantiene la expiración absoluta de la sesión.",
    security: [{ refresh_token_v2: [] }, {}],
  })
  @ApiUnauthorizedResponse({ description: "Refresh/sesión V2 inválidos." })
  async refresh(
    @Body() dto: RefreshV2Dto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const credential = selectCredential(req, dto.refreshToken);
    const result = await this.auth.refresh(
      credential.token,
      credential.source,
      req.ip,
      req.headers["user-agent"],
    );
    if (result.refreshTransport === RefreshTransportDto.COOKIE) {
      res.cookie(
        V2_REFRESH_COOKIE,
        result.rawRefreshToken,
        cookieOptions(this.ttl.remainingSessionMs(result.sessionExpiresAt)),
      );
    }
    return this.publicResult(result);
  }

  @Public()
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({ status: 204, description: "Session V2 revocada; cookie eliminada." })
  @ApiResponse({ status: 400, description: "Transporte ambiguo o DTO invalido." })
  @ApiOperation({
    summary: "Revocar la sesión V2 actual",
    description:
      "Idempotente y utilizable aunque el access haya expirado. No revoca ClientRegistration.",
    security: [{ refresh_token_v2: [] }, {}],
  })
  async logout(
    @Body() dto: LogoutV2Dto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const credential = selectCredential(req, dto.refreshToken);
    await this.auth.logout(credential.token);
    res.clearCookie(V2_REFRESH_COOKIE, cookieOptions(0));
  }

  @ApiBearerAuth()
  @Get("me")
  @ApiResponse({ status: 200, description: "Contexto V2 actual revalidado." })
  @ApiOperation({
    summary: "Obtener contexto vigente de la sesión V2",
    description:
      "Revalida Account, Member, Tenant, rol, Session y ClientRegistration asociado.",
  })
  @ApiUnauthorizedResponse({
    description: "Contexto actual inactivo o revocado.",
  })
  me(@CurrentUser() payload: AuthenticatedPrincipal) {
    return this.auth.me(payload);
  }

  @ApiBearerAuth()
  @Post("session/client")
  @ApiResponse({ status: 201, description: "Binding idempotente a ClientRegistration propio activo." })
  @ApiResponse({ status: 400, description: "Registration ID invalido." })
  @ApiResponse({ status: 401, description: "Session o ClientRegistration revocados." })
  @ApiResponse({ status: 404, description: "Registro no visible." })
  @ApiOperation({
    summary: "Asociar la sesión V2 a un ClientRegistration activo",
    description:
      "Deriva session/member/tenant del access V2. El mismo binding es idempotente y un rebind distinto responde 409.",
  })
  @ApiConflictResponse({
    description: "La sesión ya está ligada a otro registro.",
  })
  bindClient(
    @CurrentUser() payload: AuthenticatedPrincipal,
    @Body() dto: BindSessionClientDto,
  ) {
    return this.auth.bindClient(payload, dto.registrationId);
  }

  private publicResult(result: {
    accessToken: string;
    rawRefreshToken: string;
    refreshTransport: RefreshTransportDto;
    sessionExpiresAt: Date;
    context: unknown;
  }) {
    return {
      contractVersion: 2,
      accessToken: result.accessToken,
      refreshTransport: result.refreshTransport,
      sessionExpiresAt: result.sessionExpiresAt,
      context: result.context,
      ...(result.refreshTransport === RefreshTransportDto.BODY
        ? { refreshToken: result.rawRefreshToken }
        : {}),
    };
  }
}
