import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
export type AuthPayload = { uid: string; openid: string };
export type RequestWithAuth = Request & { auth?: AuthPayload };
export function authMiddleware(req: RequestWithAuth, res: Response, next: NextFunction) {
  const h = req.headers["authorization"] || "";
  const parts = h.split(" ");
  const token = parts.length === 2 && parts[0] === "Bearer" ? parts[1] : "";
  if (!token) return res.status(401).json({ success: false, data: null, error: { code: "UNAUTHORIZED", message: "Missing token" } });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ success: false, data: null, error: { code: "UNAUTHORIZED", message: "Invalid token" } });
  }
}
