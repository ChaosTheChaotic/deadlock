import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { addUser, connectDb, initializeDbs, searchUsers } from "./rlibs/index";

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return `Hello, ${input.name ?? "world"}!`;
    }),
  initDbs: t.procedure.query(async () => {
    return await initializeDbs();
  }),
  connectDB: t.procedure.query(async () => {
    return await connectDb();
  }),
  searchUsers: t.procedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      return await searchUsers(input.email);
    }),
  addUser: t.procedure
    .input(z.object({ email: z.string(), pass: z.string().optional(), oauthProvider: z.string().optional() }))
    .mutation(async ({ input }) => {
    return await addUser(input.email, input.pass, input.oauthProvider)
  })
});

export type AppRouter = typeof appRouter;
