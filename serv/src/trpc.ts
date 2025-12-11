import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { timeDiff, connectDb, initializeDbs, searchUsers } from "./rlibs/index";

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
  searchUsers: t.procedure.input(z.object({email: z.string() })).query(async ({ input }) => {
    return await searchUsers(input.email)
  }),
});

export type AppRouter = typeof appRouter;
