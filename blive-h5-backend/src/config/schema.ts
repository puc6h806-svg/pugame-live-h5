import { z } from 'zod';
import type { RoomConfigPartial } from '../types/config';

const keywordSchema = z.array(z.string().max(64)).max(20);

export const roomConfigPatchSchema = z.object({
  danmaku: z
    .object({
      enabled: z.boolean().optional(),
      maxLines: z.number().int().positive().max(200).optional(),
      showAvatar: z.boolean().optional(),
      fontSize: z.number().int().min(8).max(96).optional(),
      opacity: z.number().min(0).max(1).optional(),
      enterMs: z.number().int().nonnegative().max(10_000).optional(),
      highlightKeywords: keywordSchema.optional(),
      blockKeywords: keywordSchema.optional(),
    })
    .optional(),
  gift: z
    .object({
      enabled: z.boolean().optional(),
      minPrice: z.number().int().nonnegative().optional(),
      durationMs: z.number().int().positive().max(120_000).optional(),
      comboWindowMs: z.number().int().nonnegative().max(60_000).optional(),
    })
    .optional(),
  layout: z
    .object({
      wallPosition: z.enum(['left', 'right', 'bottom']).optional(),
      giftAnchor: z.enum(['center', 'top', 'bottom']).optional(),
    })
    .optional(),
  notice: z
    .object({
      enterEnabled: z.boolean().optional(),
      guardEnabled: z.boolean().optional(),
      scEnabled: z.boolean().optional(),
    })
    .optional(),
});

export type RoomConfigPatchInput = z.infer<typeof roomConfigPatchSchema>;

export function toRoomConfigPartial(input: RoomConfigPatchInput): RoomConfigPartial {
  return {
    danmaku: input.danmaku,
    gift: input.gift,
    layout: input.layout,
    notice: input.notice,
  };
}
