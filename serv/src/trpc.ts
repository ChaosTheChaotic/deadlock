import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { timeDiff, connectDb } from "./rlibs/index.js";

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return `Hello, ${input.name ?? "world"}!`;
    }),
  timeDiff: t.procedure
    .input(z.object({ msg: z.string() }))
    .query(({ input }) => {
      return timeDiff(input.msg);
    }),
  connectDB: t.procedure.query(async () => {
    return await connectDb();
  }),
});

export type AppRouter = typeof appRouter;
