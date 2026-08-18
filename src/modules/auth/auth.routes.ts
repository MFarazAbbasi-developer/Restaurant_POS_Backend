import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { loginSchema, refreshSchema, logoutSchema } from './auth.schema.js';

export const authRouter = Router();

// Public Authentication Endpoints
authRouter.post('/login', validateRequest({ body: loginSchema }), AuthController.login);

authRouter.post('/refresh', validateRequest({ body: refreshSchema }), AuthController.refresh);

// Protected Authentication Endpoints
authRouter.post(
  '/logout',
  authenticate,
  validateRequest({ body: logoutSchema }),
  AuthController.logout,
);

authRouter.post('/logout-all', authenticate, AuthController.logoutAll);

authRouter.get('/me', authenticate, AuthController.getMe);
