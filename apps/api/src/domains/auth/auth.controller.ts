import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { SessionId } from './decorators/session-id.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { SessionService } from './session.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.sessions.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@GetUser('id') userId: string, @Body() dto: RefreshTokenDto) {
    await this.sessions.logout(userId, dto.refreshToken);
    return null;
  }

  @Get('me')
  me(@GetUser('id') userId: string) {
    return this.auth.me(userId);
  }

  @Patch('me')
  updateMe(@GetUser('id') userId: string, @Body() dto: UpdateMeDto) {
    return this.auth.updateMe(userId, dto);
  }

  @Post('me/password')
  @HttpCode(200)
  async changePassword(
    @GetUser('id') userId: string,
    @SessionId() sessionId: string | undefined,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.auth.changePassword(userId, dto, sessionId);
    return null;
  }
}
