import { Client } from "@upstash/qstash";
import { env } from "~/env";

// Named/placed generically (not "raid-helper-*") so a future SoftRes snapshot pipeline
// (TEMPLE-77) can reuse this same client rather than constructing its own.
export const qstashClient = new Client({ token: env.QSTASH_TOKEN });
