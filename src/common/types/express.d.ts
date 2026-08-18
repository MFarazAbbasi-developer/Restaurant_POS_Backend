export interface AuthenticatedUserContext {
  id: string;
  restaurantId: string;
  username: string;
  name: string;
  sessionId?: string | undefined;
  roles: string[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUserContext | undefined;
    }
  }
}
