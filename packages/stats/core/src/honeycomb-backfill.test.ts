import { describe, expect, test } from "bun:test"
import { buildQueries } from "./honeycomb-backfill"

type Query = ReturnType<typeof buildQueries>[number]

describe("Honeycomb backfill queries", () => {
  test("preserves the day and week query contract for every backfill tier", () => {
    expect(buildQueries(1000, ["Go", "Free", "Paid"])).toEqual(
      expectedQueries(1000, ["Go", "Free", "Paid"], ["go", "free", "paid"]),
    )
  })

  test("does not add a tier filter for all-tier queries", () => {
    expect(buildQueries(7, ["all"])).toEqual(expectedQueries(7, ["all"], ["all"]))
  })

  test("keeps the source tier in filters and normalizes it for query names", () => {
    expect(buildQueries(7, ["Trial / Team"])).toEqual(expectedQueries(7, ["Trial / Team"], ["trial-team"]))
  })
})

function expectedQueries(limit: number, tiers: string[], nameSegments: string[]): Query[] {
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

function expectedQuery(
  importKey: Query["importKey"],
  nameSegment: string,
  tier: string,
  breakdowns: string[],
  limit: number,
): Query {
  return {
    name: `${importKey}-${nameSegment}`,
    importKey,
    importFlag: `--${importKey}` as Query["importFlag"],
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
