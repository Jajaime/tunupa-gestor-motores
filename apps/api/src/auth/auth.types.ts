export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
}

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}
