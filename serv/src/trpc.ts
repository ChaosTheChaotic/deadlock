import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { addUser, searchUsers, deleteUser, checkPass } from "./rlibs/index";

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string().optional() }))
    .query(({ input }) => {
      return `Hello, ${input.name ?? "world"}!`;
    }),
  searchUsers: t.procedure
    .input(z.object({ email: z.string() }))
    .query(async ({ input }) => {
      return await searchUsers(input.email);
    }),
  checkPass: t.procedure
    .input(z.object({ email: z.string(), pass: z.string() }))
    .query(async ({ input }) => {
      return await checkPass(input.email, input.pass);
    }),
  addUser: t.procedure
    .input(
      z.object({
        email: z.string(),
        pass: z.string().optional(),
        oauthProvider: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return await addUser(input.email, input.pass, input.oauthProvider);
    }),
  deleteUser: t.procedure
    .input(z.object({ email: z.string() }))
    .mutation(async ({ input }) => {
      return await deleteUser(input.email);
    }),
});

export type AppRouter = typeof appRouter;
