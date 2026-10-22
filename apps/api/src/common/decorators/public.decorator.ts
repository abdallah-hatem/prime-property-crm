import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opens a route to callers without a token. Everything else is guarded by default. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
