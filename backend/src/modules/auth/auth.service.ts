import { prisma } from "../../prisma/client";
import { env } from "../../config/env";
import jwt from "jsonwebtoken";
import { fetch } from "undici";
export async function wechatLogin(code: string) {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", env.WECHAT_APPID);
  url.searchParams.set("secret", env.WECHAT_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const r = await fetch(url.toString());
  const data = await r.json() as any;
  if (!data.openid) throw new Error(typeof data.errmsg === "string" ? data.errmsg : "Login failed");
  let user = await prisma.user.findUnique({ where: { openid: data.openid } });
  if (!user) user = await prisma.user.create({ data: { openid: data.openid } });
  const token = jwt.sign({ uid: user.id, openid: user.openid }, env.JWT_SECRET, { expiresIn: "7d" });
  return { token, user };
}
