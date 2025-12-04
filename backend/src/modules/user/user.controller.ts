import { Router } from "express";
import { ok } from "../../utils/response";
import { authMiddleware, RequestWithAuth } from "../../middleware/auth";
import { getUserById } from "./user.service";
export const userRouter = Router();
userRouter.get("/user/me", authMiddleware, async (req: RequestWithAuth, res) => {
  const u = await getUserById(req.auth!.uid);
  res.json(ok(u));
});
