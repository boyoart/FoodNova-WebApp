import { pick } from "@/src/lib/normalize";

export type RiderStats = {
  totalEarnings: number;
  dailyEarnings: number;
  weeklyEarnings: number;
  monthlyEarnings: number;
  deliveriesToday: number;
  completedDeliveries: number;
  rating: number | null;
  acceptanceRate: number | null;
  completionRate: number | null;
};

function numberFrom(value: any, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = numberFrom(value, NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value: any): number | null {
  const parsed = nullableNumber(value);
  if (parsed === null) return null;
  return Math.max(0, Math.min(100, parsed <= 1 ? parsed * 100 : parsed));
}

function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

export function normalizeRiderStats(raw: Record<string, any>, completedFallback: any[] = []): RiderStats {
  const completedFallbackCount = completedFallback.length;

  const acceptedOffers = numberFrom(
    pick(raw, ["accepted_offers", "offers.accepted", "accepted_deliveries", "jobs.accepted"], 0)
  );
  const totalOffers = numberFrom(
    pick(raw, ["total_offers", "offers.total", "offered_deliveries", "jobs.offered"], 0)
  );
  const completedDeliveries = numberFrom(
    pick(
      raw,
      [
        "completed_deliveries",
        "total_completed_deliveries",
        "deliveries_completed",
        "orders_completed",
        "completed",
        "lifetime.completed",
        "lifetime.deliveries",
        "deliveries.total_completed",
      ],
      completedFallbackCount
    ),
    completedFallbackCount
  );
  const assignedDeliveries = numberFrom(
    pick(raw, ["assigned_deliveries", "total_assignments", "deliveries_assigned", "jobs.assigned"], 0)
  );

  return {
    totalEarnings: numberFrom(
      pick(raw, ["total_earnings", "lifetime_earnings", "earnings.total", "earnings", "total"], 0)
    ),
    dailyEarnings: numberFrom(
      pick(raw, ["today_earnings", "earnings_today", "daily_earnings", "today.earnings", "earnings.today", "todayEarnings", "today_payout"], 0)
    ),
    weeklyEarnings: numberFrom(
      pick(raw, ["week_earnings", "weekly_earnings", "this_week", "week.earnings", "earnings.week", "earnings.this_week"], 0)
    ),
    monthlyEarnings: numberFrom(
      pick(raw, ["month_earnings", "monthly_earnings", "this_month", "month.earnings", "earnings.month", "earnings.this_month"], 0)
    ),
    deliveriesToday: numberFrom(
      pick(
        raw,
        [
          "today_deliveries",
          "deliveries_today",
          "completed_today",
          "today_completed",
          "orders_completed_today",
          "deliveries_completed_today",
          "today.deliveries",
          "today.completed",
        ],
        0
      )
    ),
    completedDeliveries,
    rating: nullableNumber(pick(raw, ["rating", "average_rating", "avg_rating", "ratings.average", "performance.rating"], null)),
    acceptanceRate:
      percent(pick(raw, ["acceptance_rate", "accept_rate", "rates.acceptance", "performance.acceptance_rate"], null)) ??
      rate(acceptedOffers, totalOffers),
    completionRate:
      percent(pick(raw, ["completion_rate", "complete_rate", "rates.completion", "performance.completion_rate"], null)) ??
      rate(completedDeliveries, assignedDeliveries || acceptedOffers),
  };
}

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}
