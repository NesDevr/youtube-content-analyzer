/**
 * Canonical home for every outlier calculation.
 *
 * Nothing else in the codebase may define an outlier formula. Each metric here
 * carries an explicit version string so a stored score can always be traced back
 * to the rules that produced it.
 */

// ── Versions ───────────────────────────────────────────

/**
 * Current primary metric: a video's views against the median views of the
 * channel's comparable recent uploads.
 */
export const RECENT_MEDIAN_METRIC = "recent_median_view_ratio";
export const RECENT_MEDIAN_FORMULA_VERSION = "recent-median-v1";

/**
 * Legacy metric, kept only so old stored scores remain readable:
 * views / (channel lifetime views / channel video count). It mixes Shorts,
 * long-form and livestreams into one baseline and is dragged down by a
 * channel's entire back catalogue, so it is never presented as the primary
 * outlier score.
 */
export const LEGACY_LIFETIME_AVERAGE_METRIC = "lifetime_average_view_ratio";
export const LEGACY_LIFETIME_AVERAGE_VERSION = "legacy-lifetime-average-v0";

// ── Format classification ──────────────────────────────

export type VideoFormat = "long-form" | "short" | "live";

/**
 * YouTube's Data API exposes no "is this a Short?" flag, so format is decided
 * by duration and live metadata. These are the only rules in the codebase:
 *
 * - `live`      — the item is or was a broadcast (`liveBroadcastContent` is
 *                 `live`/`upcoming`, or the item carries liveStreamingDetails).
 * - `short`     — duration is at most 180 s, YouTube's current maximum for a
 *                 Short. A regular sub-3-minute upload is counted as a Short by
 *                 this rule; the alternative (guessing from aspect ratio, which
 *                 the API does not return) would be less predictable.
 * - `long-form` — everything else.
 *
 * Zero-duration items are livestreams or unavailable videos, never Shorts.
 */
export const SHORTS_MAX_SECONDS = 180;

export interface FormatInputs {
  durationSeconds: number;
  liveBroadcastContent?: string | null;
  hasLiveStreamingDetails?: boolean;
}

export function classifyFormat(video: FormatInputs): VideoFormat {
  if (
    video.hasLiveStreamingDetails ||
    video.liveBroadcastContent === "live" ||
    video.liveBroadcastContent === "upcoming"
  ) {
    return "live";
  }
  if (video.durationSeconds <= 0) return "live";
  return video.durationSeconds <= SHORTS_MAX_SECONDS ? "short" : "long-form";
}

// ── Baseline configuration ─────────────────────────────

/** Uploads this many days either side of the target may enter the baseline. */
export const BASELINE_WINDOW_DAYS = 180;
/** At most this many comparable uploads, the ones closest in publish date. */
export const BASELINE_MAX_SAMPLE = 20;
/** Below this many comparable uploads the ratio is not reported at all. */
export const BASELINE_MIN_SAMPLE = 5;

export interface BaselineOptions {
  windowDays?: number;
  maxSample?: number;
  minSample?: number;
  now?: Date;
}

// ── Inputs ─────────────────────────────────────────────

export interface UploadVideo {
  id: string;
  title: string;
  publishedAt: Date;
  /** `null` when YouTube hides or omits the view count for this video. */
  views: number | null;
  durationSeconds: number;
  liveBroadcastContent?: string | null;
  hasLiveStreamingDetails?: boolean;
}

// ── Output ─────────────────────────────────────────────

export type RecentMedianStatus =
  | "ok"
  /** Fewer comparable uploads than `minSample`. */
  | "insufficient_sample"
  /** Enough comparables, but their median is 0 — no ratio can be expressed. */
  | "zero_baseline"
  /** The target itself has no usable view count. */
  | "target_views_unavailable";

export interface ComparableVideo {
  id: string;
  title: string;
  publishedAt: string;
  views: number;
  durationSeconds: number;
  dayGapFromTarget: number;
}

export interface RecentMedianResult {
  metric: typeof RECENT_MEDIAN_METRIC;
  formulaVersion: typeof RECENT_MEDIAN_FORMULA_VERSION;
  status: RecentMedianStatus;
  /** Target views ÷ baseline median views, 2 dp. `null` unless status is `ok`. */
  ratio: number | null;
  baselineMedianViews: number | null;
  targetViews: number | null;
  /** Format of the target; the baseline only contains uploads of this format. */
  format: VideoFormat;
  sampleSize: number;
  minSampleSize: number;
  maxSampleSize: number;
  comparisonWindowDays: number;
  /** Publish-date range actually covered by the baseline, ISO strings. */
  windowStart: string;
  windowEnd: string;
  comparables: ComparableVideo[];
  /** Same-format uploads in the window whose view count YouTube did not return. */
  excludedUnavailable: number;
  /** Human-readable statement of exactly what was computed. */
  explanation: string;
  collectedAt: string;
}

// ── Calculation ────────────────────────────────────────

/** Median of a non-empty list. Even counts average the two middle values. */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error("median() requires at least one value");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Compares one upload against the median of its channel's comparable recent
 * uploads.
 *
 * Baseline rules, all of them visible in the returned object:
 *
 * 1. Only uploads of the **same format** as the target are comparable.
 * 2. The target is **always excluded** from its own baseline.
 * 3. Only uploads published within ±`windowDays` of the target qualify, so a
 *    three-year-old video is judged against its contemporaries rather than
 *    against what the channel publishes today.
 * 4. If more than `maxSample` qualify, the ones closest in publish date win.
 * 5. Uploads with no view count are excluded and reported separately.
 * 6. Fewer than `minSample` comparables ⇒ no ratio, status `insufficient_sample`.
 */
export function computeRecentMedianOutlier(
  target: UploadVideo,
  channelUploads: UploadVideo[],
  options: BaselineOptions = {}
): RecentMedianResult {
  const windowDays = options.windowDays ?? BASELINE_WINDOW_DAYS;
  const maxSample = options.maxSample ?? BASELINE_MAX_SAMPLE;
  const minSample = options.minSample ?? BASELINE_MIN_SAMPLE;
  const collectedAt = (options.now ?? new Date()).toISOString();

  const format = classifyFormat(target);
  const targetTime = target.publishedAt.getTime();
  const windowMs = windowDays * DAY_MS;

  const inWindowSameFormat = channelUploads.filter(
    (upload) =>
      upload.id !== target.id &&
      classifyFormat(upload) === format &&
      Math.abs(upload.publishedAt.getTime() - targetTime) <= windowMs
  );

  const excludedUnavailable = inWindowSameFormat.filter(
    (upload) => upload.views === null
  ).length;

  const comparables: ComparableVideo[] = inWindowSameFormat
    .filter((upload): upload is UploadVideo & { views: number } => upload.views !== null)
    .map((upload) => ({
      id: upload.id,
      title: upload.title,
      publishedAt: upload.publishedAt.toISOString(),
      views: upload.views,
      durationSeconds: upload.durationSeconds,
      dayGapFromTarget:
        Math.round(
          (Math.abs(upload.publishedAt.getTime() - targetTime) / DAY_MS) * 10
        ) / 10,
    }))
    .sort((a, b) => a.dayGapFromTarget - b.dayGapFromTarget)
    .slice(0, maxSample)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const sampleSize = comparables.length;
  const publishDates = comparables.map((c) => c.publishedAt).sort();

  const base = {
    metric: RECENT_MEDIAN_METRIC,
    formulaVersion: RECENT_MEDIAN_FORMULA_VERSION,
    targetViews: target.views,
    format,
    sampleSize,
    minSampleSize: minSample,
    maxSampleSize: maxSample,
    comparisonWindowDays: windowDays,
    windowStart: publishDates[0] ?? "",
    windowEnd: publishDates[publishDates.length - 1] ?? "",
    comparables,
    excludedUnavailable,
    collectedAt,
  } as const;

  if (sampleSize < minSample) {
    return {
      ...base,
      status: "insufficient_sample",
      ratio: null,
      baselineMedianViews: null,
      explanation:
        `Only ${sampleSize} comparable ${format} upload(s) within ±${windowDays} days of this video ` +
        `(${minSample} required), so no baseline was calculated.`,
    };
  }

  const baselineMedianViews = median(comparables.map((c) => c.views));

  if (target.views === null) {
    return {
      ...base,
      status: "target_views_unavailable",
      ratio: null,
      baselineMedianViews,
      explanation:
        "YouTube did not return a view count for this video, so it cannot be compared with its baseline.",
    };
  }

  if (baselineMedianViews === 0) {
    return {
      ...base,
      status: "zero_baseline",
      ratio: null,
      baselineMedianViews,
      explanation:
        `The median of the ${sampleSize} comparable ${format} uploads is 0 views, ` +
        "so a ratio would be undefined.",
    };
  }

  const ratio = Math.round((target.views / baselineMedianViews) * 100) / 100;

  return {
    ...base,
    status: "ok",
    ratio,
    baselineMedianViews,
    explanation:
      `${target.views.toLocaleString("en-US")} views ÷ ${baselineMedianViews.toLocaleString("en-US")} ` +
      `median views of the ${sampleSize} comparable ${format} upload(s) published within ` +
      `±${windowDays} days = ${ratio}×.`,
  };
}

// ── Measured growth between snapshots ──────────────────

export const MEASURED_VELOCITY_METRIC = "measured_view_velocity";
export const MEASURED_VELOCITY_VERSION = "measured-velocity-v1";

/**
 * A daily reading pairs the newest snapshot with an earlier one taken roughly a
 * day before. Collection never lands exactly on 24 hours, so a window is
 * accepted and the *actual* interval is always reported alongside the rate.
 */
export const DAILY_WINDOW_MIN_HOURS = 18;
export const DAILY_WINDOW_MAX_HOURS = 36;
/** A multi-day reading needs at least this much observed history. */
export const MULTI_DAY_MIN_HOURS = 72;

export interface SnapshotPoint {
  /** `null` when that collection could not read a view count. */
  views: number | null;
  collectedAt: Date;
}

export interface VelocityReading {
  fromViews: number;
  toViews: number;
  /** Signed: YouTube revises counts downward, and that is reported as measured. */
  viewChange: number;
  /** The exact observed interval, never rounded up to a whole day. */
  intervalHours: number;
  /** `viewChange` scaled to 24 h. Only meaningful with `intervalHours`. */
  viewsPer24Hours: number;
  from: string;
  to: string;
}

export interface VelocityReport {
  metric: typeof MEASURED_VELOCITY_METRIC;
  formulaVersion: typeof MEASURED_VELOCITY_VERSION;
  /** Snapshots that carried a view count. */
  usableSnapshots: number;
  daily: VelocityReading | null;
  /** Why `daily` is null. Empty when a reading was produced. */
  dailyUnavailable: string;
  multiDay: VelocityReading | null;
  multiDayUnavailable: string;
}

function reading(earlier: { views: number; collectedAt: Date }, latest: { views: number; collectedAt: Date }): VelocityReading {
  const intervalMs = latest.collectedAt.getTime() - earlier.collectedAt.getTime();
  const viewChange = latest.views - earlier.views;
  return {
    fromViews: earlier.views,
    toViews: latest.views,
    viewChange,
    intervalHours: Math.round((intervalMs / 3_600_000) * 100) / 100,
    viewsPer24Hours: Math.round((viewChange / intervalMs) * DAY_MS * 100) / 100,
    from: earlier.collectedAt.toISOString(),
    to: latest.collectedAt.toISOString(),
  };
}

/**
 * Growth measured between real observations. Nothing here divides lifetime
 * views by video age: a video that has been observed only once has no velocity,
 * and says so.
 */
export function measureVelocity(snapshots: SnapshotPoint[]): VelocityReport {
  const usable = snapshots
    .filter((point): point is { views: number; collectedAt: Date } => point.views !== null)
    .sort((a, b) => a.collectedAt.getTime() - b.collectedAt.getTime());

  const base = {
    metric: MEASURED_VELOCITY_METRIC,
    formulaVersion: MEASURED_VELOCITY_VERSION,
    usableSnapshots: usable.length,
  } as const;

  if (usable.length < 2) {
    const reason = `Only ${usable.length} observation(s) with a public view count; two are required to measure any change.`;
    return { ...base, daily: null, dailyUnavailable: reason, multiDay: null, multiDayUnavailable: reason };
  }

  const latest = usable[usable.length - 1];
  const earliest = usable[0];

  // Daily: the earlier snapshot closest to 24 h before the latest one, and only
  // if it actually falls inside the accepted window.
  const candidates = usable
    .slice(0, -1)
    .map((point) => ({
      point,
      hours: (latest.collectedAt.getTime() - point.collectedAt.getTime()) / 3_600_000,
    }))
    .sort((a, b) => Math.abs(a.hours - 24) - Math.abs(b.hours - 24));
  const closest = candidates[0];
  const dailyMatch =
    closest.hours >= DAILY_WINDOW_MIN_HOURS && closest.hours <= DAILY_WINDOW_MAX_HOURS
      ? closest
      : null;

  const totalHours =
    (latest.collectedAt.getTime() - earliest.collectedAt.getTime()) / 3_600_000;

  return {
    ...base,
    daily: dailyMatch ? reading(dailyMatch.point, latest) : null,
    dailyUnavailable: dailyMatch
      ? ""
      : `No earlier observation between ${DAILY_WINDOW_MIN_HOURS} and ${DAILY_WINDOW_MAX_HOURS} hours before the latest one (closest is ${Math.round(closest.hours * 10) / 10} h).`,
    multiDay: totalHours >= MULTI_DAY_MIN_HOURS ? reading(earliest, latest) : null,
    multiDayUnavailable:
      totalHours >= MULTI_DAY_MIN_HOURS
        ? ""
        : `Observations span ${Math.round(totalHours * 10) / 10} h; ${MULTI_DAY_MIN_HOURS} h of history are required.`,
  };
}

// ── Age-normalized comparison ──────────────────────────

export const AGE_NORMALIZED_METRIC = "age_normalized_view_ratio";
export const AGE_NORMALIZED_VERSION = "age-normalized-v1";

/** A comparable observation may be this far from the target's age, either way. */
export const AGE_TOLERANCE_FRACTION = 0.25;
/** Below this many comparable observations no ratio is reported. */
export const AGE_MIN_COMPARABLES = 5;

/** One stored reading of some video's view count at a known age. */
export interface AgeObservation {
  videoId: string;
  ageHours: number;
  views: number;
}

export interface AgeNormalizedResult {
  metric: typeof AGE_NORMALIZED_METRIC;
  formulaVersion: typeof AGE_NORMALIZED_VERSION;
  status: "ok" | "insufficient_comparables";
  targetAgeHours: number;
  targetViews: number;
  medianViewsAtComparableAge: number | null;
  ratio: number | null;
  sampleSize: number;
  minSampleSize: number;
  toleranceFraction: number;
  comparables: AgeObservation[];
  explanation: string;
}

/**
 * Compares a video against what *other* videos had actually accumulated at the
 * same age. Unlike a views-per-day estimate this needs real history, so it is
 * only reported once enough comparable observations have been collected.
 *
 * One observation per comparable video — the one closest to the target's age —
 * so a heavily sampled video cannot dominate the median.
 */
export function ageNormalizedComparison(
  target: { videoId: string; ageHours: number; views: number },
  observations: AgeObservation[],
  options: { toleranceFraction?: number; minSample?: number } = {}
): AgeNormalizedResult {
  const tolerance = options.toleranceFraction ?? AGE_TOLERANCE_FRACTION;
  const minSample = options.minSample ?? AGE_MIN_COMPARABLES;
  const spread = target.ageHours * tolerance;

  const closestPerVideo = new Map<string, AgeObservation>();
  for (const observation of observations) {
    if (observation.videoId === target.videoId) continue;
    if (Math.abs(observation.ageHours - target.ageHours) > spread) continue;
    const held = closestPerVideo.get(observation.videoId);
    if (
      !held ||
      Math.abs(observation.ageHours - target.ageHours) <
        Math.abs(held.ageHours - target.ageHours)
    ) {
      closestPerVideo.set(observation.videoId, observation);
    }
  }

  const comparables = [...closestPerVideo.values()].sort(
    (a, b) => a.ageHours - b.ageHours
  );
  const base = {
    metric: AGE_NORMALIZED_METRIC,
    formulaVersion: AGE_NORMALIZED_VERSION,
    targetAgeHours: Math.round(target.ageHours * 10) / 10,
    targetViews: target.views,
    sampleSize: comparables.length,
    minSampleSize: minSample,
    toleranceFraction: tolerance,
    comparables,
  } as const;

  if (comparables.length < minSample) {
    return {
      ...base,
      status: "insufficient_comparables",
      medianViewsAtComparableAge: null,
      ratio: null,
      explanation:
        `Only ${comparables.length} other video(s) have a stored observation within ` +
        `±${Math.round(tolerance * 100)}% of ${base.targetAgeHours} h of age (${minSample} required), ` +
        "so no age-normalized comparison was calculated.",
    };
  }

  const medianViews = median(comparables.map((c) => c.views));
  if (medianViews === 0) {
    return {
      ...base,
      status: "insufficient_comparables",
      medianViewsAtComparableAge: 0,
      ratio: null,
      explanation:
        `The ${comparables.length} comparable observations median 0 views at this age, ` +
        "so a ratio would be undefined.",
    };
  }

  return {
    ...base,
    status: "ok",
    medianViewsAtComparableAge: medianViews,
    ratio: Math.round((target.views / medianViews) * 100) / 100,
    explanation:
      `${target.views.toLocaleString("en-US")} views at ${base.targetAgeHours} h old ÷ ` +
      `${medianViews.toLocaleString("en-US")} median views of ${comparables.length} other ` +
      `video(s) observed at a comparable age = ${Math.round((target.views / medianViews) * 100) / 100}×.`,
  };
}

/**
 * The old score, retained only for reading historical values. Returns `null`
 * rather than 0 when the channel has no usable average, so callers cannot mistake
 * "unknown" for "performed terribly".
 */
export function legacyLifetimeAverageRatio(
  views: number,
  channelAverageViews: number | null
): number | null {
  if (channelAverageViews === null || channelAverageViews <= 0) return null;
  return Math.round((views / channelAverageViews) * 100) / 100;
}
