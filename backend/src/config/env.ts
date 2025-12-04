import dotenv from "dotenv";
dotenv.config();
export const env = {
  PORT: parseInt(process.env.PORT || "3000", 10),
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret",
  WECHAT_APPID: process.env.WECHAT_APPID || "",
  WECHAT_SECRET: process.env.WECHAT_SECRET || "",
  DATABASE_URL: process.env.DATABASE_URL || ""
};
