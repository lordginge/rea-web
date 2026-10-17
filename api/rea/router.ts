import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getDb } from "../queries/connection";
import { analyses } from "../../db/schema";
import { desc, eq } from "drizzle-orm";
import {
  analyzeWebsite,
  assertPublicUrl,
  type ReaAnalyzeOptions,
} from "./runner";

const MAX_RESULT_CHARS = 800_000;

function trimResult(value: unknown): string {
  let s = JSON.stringify(value ?? null);
  if (s.length > MAX_RESULT_CHARS) {
    s = s.slice(0, MAX_RESULT_CHARS) + ',"__truncated":true}';
  }
  return s;
}

export const reaRouter = createRouter({
  analyze: publicQuery
    .input(
      z.object({
        url: z.string().min(4).max(2048),
        options: z.object({
          screenshot: z.boolean().default(true),
          consoleText: z.boolean().default(true),
          storageKeys: z.boolean().default(true),
          scriptSources: z.boolean().default(false),
          jsonBodyShapes: z.boolean().default(true),
        }),
      }),
    )
    .mutation(async ({ input }) => {
      const url = await assertPublicUrl(input.url);
      const options: ReaAnalyzeOptions = input.options;
      try {
        const result = await analyzeWebsite(url, options);
        const payload = trimResult({
          ...result,
          url: url.toString(),
          analyzedAt: new Date().toISOString(),
        });
        const db = getDb();
        await db.insert(analyses).values({
          url: url.toString(),
          status: "done",
          optionsJson: JSON.stringify(options),
          resultJson: payload,
        });
        return { ok: true as const, result: JSON.parse(payload) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          const db = getDb();
          await db.insert(analyses).values({
            url: url.toString(),
            status: "error",
            optionsJson: JSON.stringify(options),
            error: message,
          });
        } catch {
          /* history is best-effort */
        }
        return { ok: false as const, error: message };
      }
    }),

  history: publicQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: analyses.id,
        url: analyses.url,
        status: analyses.status,
        createdAt: analyses.createdAt,
      })
      .from(analyses)
      .orderBy(desc(analyses.createdAt))
      .limit(30);
    return rows;
  }),

  get: publicQuery.input(z.object({ id: z.number().int() })).mutation(async ({ input }) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(analyses)
      .where(eq(analyses.id, input.id))
      .limit(1);
    return rows[0] ?? null;
  }),
});
