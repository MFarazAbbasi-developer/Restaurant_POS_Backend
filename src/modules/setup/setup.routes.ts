import { Router } from 'express';
import { SetupController } from './setup.controller.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { completeSetupSchema } from './setup.schema.js';

export const setupRouter = Router();

// Unauthenticated first-run endpoints
setupRouter.get('/status', SetupController.getStatus);

setupRouter.post(
  '/',
  validateRequest({ body: completeSetupSchema }),
  SetupController.completeSetup,
);
