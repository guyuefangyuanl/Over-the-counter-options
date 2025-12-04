import { prisma } from "../../prisma/client";
export async function getUserById(id: string) { return prisma.user.findUnique({ where: { id } }); }
