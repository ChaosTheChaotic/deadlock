import { createTRPCReact } from "@trpc/react-query";
import type { appRouter } from '../../../serv/src/trpc';

export const trpc = createTRPCReact<appRouter>();
