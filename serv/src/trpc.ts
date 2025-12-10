import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { timeDiff, connectDb, initializeDbs } from "./rlibs/index";

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
  initDbs: t.procedure.query(async () => {
    return await initializeDbs();
  }),
  connectDB: t.procedure.query(async () => {
    return await connectDb();
  }),
});

export type AppRouter = typeof appRouter;
