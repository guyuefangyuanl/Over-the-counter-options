import { Router } from "express";
import { ok, fail } from "../../utils/response";
import { WechatLoginBody, WechatLoginBody as WechatLoginBodyType } from "./auth.types";
import { wechatLogin } from "./auth.service";
import { authMiddleware, RequestWithAuth } from "../../middleware/auth";
export const authRouter = Router();
authRouter.post("/auth/wechat-login", async (req, res) => {
  const parse = WechatLoginBody.safeParse(req.body);
  if (!parse.success) return res.status(400).json(fail("INVALID_BODY", "code required").body);
  try {
    const { token, user } = await wechatLogin((parse.data as WechatLoginBodyType).code);
    res.json(ok({ token, user }));
  } catch (e: any) {
    const m = typeof e?.message === "string" ? e.message : "Login error";
    const r = fail("LOGIN_ERROR", m, 400);
    res.status(r.status).json(r.body);
  }
});
authRouter.get("/auth/profile", authMiddleware, async (req: RequestWithAuth, res) => {
  res.json(ok({ uid: req.auth!.uid, openid: req.auth!.openid }));
});
