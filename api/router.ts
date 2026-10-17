import { createRouter, publicQuery } from "./middleware";
import { reaRouter } from "./rea/router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  rea: reaRouter,

  // TODO: add feature routers here, e.g.
  // todo: createRouter({
  //   list: publicQuery.query(() => findTodos()),
  // }),
});

export type AppRouter = typeof appRouter;
