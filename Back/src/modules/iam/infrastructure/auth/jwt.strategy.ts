import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../../application/types/jwt-payload.type';
import { AuthenticatedPrincipal } from '../../application/types/authenticated-principal.type';
import { CurrentAuthContextResolver } from '../../application/services/current-auth-context.resolver';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly currentContext: CurrentAuthContextResolver) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    return this.currentContext.resolve(payload);
  }
}
