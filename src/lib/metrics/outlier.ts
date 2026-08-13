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
