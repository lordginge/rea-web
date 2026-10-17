import {
  mysqlTable,
  serial,
  varchar,
  longtext,
  timestamp,
} from "drizzle-orm/mysql-core";

export const analyses = mysqlTable("analyses", {
  id: serial("id").primaryKey(),
  url: varchar("url", { length: 2048 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("done"),
  optionsJson: longtext("options_json"),
  resultJson: longtext("result_json"),
  error: longtext("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Analysis = typeof analyses.$inferSelect;
