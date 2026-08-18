import { z } from 'zod';

export const loginSchema = z
  .object({
    username: z
      .string({ required_error: 'Username is required' })
      .trim()
      .min(1, 'Username cannot be empty'),
    pin: z.string().trim().min(1, 'PIN cannot be empty').optional(),
    password: z.string().min(1, 'Password cannot be empty').optional(),
    restaurantId: z.string().uuid('Invalid restaurant ID format').optional(),
  })
  .refine((data) => Boolean(data.pin || data.password), {
    message: 'Either PIN or password must be provided',
    path: ['pin'],
  });

export const refreshSchema = z.object({
  refreshToken: z
    .string({ required_error: 'Refresh token is required' })
    .trim()
    .min(1, 'Refresh token cannot be empty'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1).optional(),
});

export const verifyManagerPinSchema = z.object({
  pin: z.string({ required_error: 'Manager PIN is required' }).trim().min(1, 'PIN cannot be empty'),
  requiredPermission: z
    .string({ required_error: 'Required permission is required' })
    .trim()
    .min(1, 'Permission key cannot be empty'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type VerifyManagerPinInput = z.infer<typeof verifyManagerPinSchema>;
