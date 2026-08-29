import { describe, expect, test } from "bun:test"

describe("Honeycomb backfill queries", () => {
  test("preserves the day and week query contract for every backfill tier", async () => {
    expect(await queries(["Go", "Free", "Paid"], 1000)).toEqual({
      tiers: ["Go", "Free", "Paid"],
      import_hint: "bun src/honeycomb-backfill.ts import --dir downloads",
      queries: expectedQueries(1000, ["Go", "Free", "Paid"], ["go", "free", "paid"]),
    })
  })

  test("does not add a tier filter for all-tier queries", async () => {
    expect(await queries(["all"], 7)).toEqual({
      tiers: ["all"],
      import_hint: "bun src/honeycomb-backfill.ts import --dir downloads",
      queries: expectedQueries(7, ["all"], ["all"]),
    })
  })

  test("keeps the source tier in filters and normalizes it for query names", async () => {
    expect(await queries(["Trial / Team"], 7)).toEqual({
      tiers: ["Trial / Team"],
      import_hint: "bun src/honeycomb-backfill.ts import --dir downloads",
      queries: expectedQueries(7, ["Trial / Team"], ["trial-team"]),
    })
  })
})

async function queries(tiers: string[], limit: number) {
  const child = Bun.spawn(
    [
      process.execPath,
      new URL("./honeycomb-backfill.ts", import.meta.url).pathname,
      "queries",
      "--tiers",
      tiers.join(","),
      "--limit",
      limit.toString(),
    ],
    { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
  ])

  expect(code, stderr).toBe(0)
  return JSON.parse(stdout) as unknown
}

function expectedQueries(limit: number, tiers: string[], nameSegments: string[]) {
  return [
    ...tiers.flatMap((tier, index) => [
      expectedQuery("model-day", nameSegments[index]!, tier, ["date", "tier", "stat_provider_2", "stat_model_2"], limit),
      expectedQuery("provider-day", nameSegments[index]!, tier, ["date", "tier", "stat_provider_2"], limit),
      expectedQuery("geo-day", nameSegments[index]!, tier, ["date", "tier", "country", "continent"], limit),
      expectedQuery(
        "geo-model-day",
        nameSegments[index]!,
        tier,
        ["date", "tier", "stat_provider_2", "stat_model_2", "country", "continent"],
        limit,
      ),
    ]),
    ...tiers.flatMap((tier, index) => [
      expectedQuery("model-week", nameSegments[index]!, tier, ["week", "tier", "stat_provider_2", "stat_model_2"], limit),
      expectedQuery("provider-week", nameSegments[index]!, tier, ["week", "tier", "stat_provider_2"], limit),
      expectedQuery("geo-week", nameSegments[index]!, tier, ["week", "tier", "country", "continent"], limit),
      expectedQuery(
        "geo-model-week",
        nameSegments[index]!,
        tier,
        ["week", "tier", "stat_provider_2", "stat_model_2", "country", "continent"],
        limit,
      ),
    ]),
  ]
}

function expectedQuery(importKey: string, nameSegment: string, tier: string, breakdowns: string[], limit: number) {
  return {
    name: `${importKey}-${nameSegment}`,
    importKey,
    importFlag: `--${importKey}`,
    query: {
      granularity: 0,
      breakdowns,
      calculations: [
        { op: "COUNT_DISTINCT", column: "session" },
        { op: "COUNT" },
        { op: "COUNT_DISTINCT", column: "workspace" },
        { op: "SUM", column: "tokens.input" },
        { op: "SUM", column: "tokens.output" },
        { op: "SUM", column: "tokens.reasoning" },
        { op: "SUM", column: "tokens.cache_read" },
        { op: "SUM", column: "tokens" },
        { op: "SUM", column: "cost.input.microcents" },
        { op: "SUM", column: "cost.output.microcents" },
        { op: "SUM", column: "cost.total.microcents" },
        { op: "AVG", column: "duration" },
        { op: "P50", column: "duration" },
        { op: "P95", column: "duration" },
        { op: "AVG", column: "time_to_first_byte" },
        { op: "P50", column: "time_to_first_byte" },
        { op: "P95", column: "time_to_first_byte" },
        { op: "AVG", column: "tps.output" },
      ],
      filters: [
        { column: "event_type", op: "=", value: "completions" },
        { column: "model", op: "exists" },
        { column: "model", op: "!=", value: "" },
        { column: "model", op: "!=", value: "alpha-gpt-next" },
        ...(tier === "all" ? [] : [{ column: "tier", op: "=", value: tier }]),
      ],
      filter_combination: "AND",
      orders: [{ column: "tokens", op: "SUM", order: "descending" }],
      havings: [],
      limit,
      formulas: [],
    },
  }
}
