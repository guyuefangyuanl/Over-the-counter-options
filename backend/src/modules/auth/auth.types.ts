import { z } from "zod";
export const WechatLoginBody = z.object({ code: z.string().min(1) });
export type WechatLoginBody = z.infer<typeof WechatLoginBody>;
