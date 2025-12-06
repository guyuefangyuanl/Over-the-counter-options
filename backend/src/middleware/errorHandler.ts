import { Request, Response, NextFunction } from "express";
import { error as logError } from "../utils/logger";
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  logError("error", err?.message || String(err));
  const message = typeof err?.message === "string" ? err.message : "Internal Server Error";
  res.status(500).json({ success: false, data: null, error: { code: "INTERNAL_ERROR", message } });
}
