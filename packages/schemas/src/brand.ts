import { z } from 'zod';

export const BrandKitSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  name: z.string(),
  logos: z.array(z.object({
    url: z.string().url(),
    type: z.enum(['primary', 'secondary', 'icon', 'wordmark']),
  })),
  palette: z.record(z.string()), // color names to hex values
  fonts: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
  }),
  stingStyle: z.enum(['minimal', 'bold', 'elegant']).default('minimal'),
  watermark: z.object({
    enabled: z.boolean().default(false),
    position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).default('bottom-right'),
    opacity: z.number().min(0).max(1).default(0.6),
  }).optional(),
  safeZoneMargins: z.object({
    top: z.number().min(0).max(0.2).default(0.05),
    bottom: z.number().min(0).max(0.2).default(0.05),
    left: z.number().min(0).max(0.2).default(0.05),
    right: z.number().min(0).max(0.2).default(0.05),
  }).optional(),
  endCard: z.object({
    enabled: z.boolean().default(false),
    text: z.string().optional(),
    url: z.string().optional(),
    socialHandles: z.record(z.string()).optional(),
  }).optional(),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;
