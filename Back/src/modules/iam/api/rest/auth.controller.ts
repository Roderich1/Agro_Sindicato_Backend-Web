import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { LoginDto } from '../../application/dtos/login.dto';
import { GetMeUseCase } from '../../application/use-cases/get-me.use-case';
import { LoginUseCase } from '../../application/use-cases/login.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RefreshSessionUseCase } from '../../application/use-cases/refresh-session.use-case';
import { JwtPayload } from '../../application/types/jwt-payload.type';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';

const REFRESH_COOKIE = 'refresh_token';

function requestSource(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0]?.trim() || req.ip || 'unknown-ip';
  const userAgent = req.headers['user-agent'] || 'unknown-agent';

  return `ip=${ip} ua="${userAgent}"`;
}

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    maxAge: maxAgeMs,
    path: '/api/v1/auth',
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshSessionUseCase: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getMeUseCase: GetMeUseCase,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.logger.log(`[AUTH LOGIN TRY] email=${dto.email} ${requestSource(req)}`);

    try {
      const result = await this.loginUseCase.execute(
        dto,
        req.ip,
        req.headers['user-agent'],
      );
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
      this.logger.log(`[AUTH LOGIN OK] userId=${result.user.id} email=${result.user.email} role=${result.user.role} tenantId=${result.user.tenantId} ${requestSource(req)}`);

      return { accessToken: result.accessToken, user: result.user };
    } catch (error) {
      this.logger.warn(`[AUTH LOGIN FAIL] email=${dto.email} ${requestSource(req)} reason="${error instanceof Error ? error.message : 'unknown'}"`);
      throw error;
    }
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar sesión con refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];

    try {
      const result = await this.refreshSessionUseCase.execute(
        rawToken,
        req.ip,
        req.headers['user-agent'],
      );
      res.cookie(REFRESH_COOKIE, result.rawRefreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));
      this.logger.log(`[AUTH REFRESH OK] userId=${result.user.id} email=${result.user.email} ${requestSource(req)}`);

      return { accessToken: result.accessToken, user: result.user };
    } catch (error) {
      this.logger.warn(`[AUTH REFRESH FAIL] hasCookie=${Boolean(rawToken)} ${requestSource(req)} reason="${error instanceof Error ? error.message : 'unknown'}"`);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión (revoca refresh token del dispositivo)' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
    await this.logoutUseCase.execute(rawToken);
    res.clearCookie(REFRESH_COOKIE, cookieOptions(0));
    this.logger.log(`[AUTH LOGOUT] hasCookie=${Boolean(rawToken)} ${requestSource(req)}`);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil del usuario autenticado' })
  async me(@CurrentUser() user: JwtPayload) {
    return this.getMeUseCase.execute(user.sub);
  }
}
