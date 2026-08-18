import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "@prisma/client";
export * from "./gioi-han-tan-suat.service";
export * from "./tim-anh.service";
export * from "./tim-anh-kho";
export * from "./tim-anh-album.service";
export * from "./tim-anh-quan-tri.service";
