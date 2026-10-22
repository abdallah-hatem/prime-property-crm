import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** `POST /auth/refresh` and `POST /auth/logout` (mirrors RefreshRequestSchema). */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken!: string;
}
