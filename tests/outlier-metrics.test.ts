import { describe, expect, it } from "vitest";
import {
  BASELINE_MIN_SAMPLE,
  RECENT_MEDIAN_FORMULA_VERSION,
  ageNormalizedComparison,
  classifyFormat,
  computeRecentMedianOutlier,
  legacyLifetimeAverageRatio,
  measureVelocity,
  median,
  type UploadVideo,
} from "@/lib/metrics/outlier";
import { parseVideoId } from "@/lib/youtube";

const TARGET_DATE = new Date("2026-06-01T00:00:00Z");

function upload(overrides: Partial<UploadVideo> & { id: string }): UploadVideo {
  return {
    title: `Video ${overrides.id}`,
    publishedAt: TARGET_DATE,
    views: 1000,
    durationSeconds: 600,
    liveBroadcastContent: "none",
    hasLiveStreamingDetails: false,
    ...overrides,
  };
}

/** n uploads spaced one day apart, walking back from the target date. */
function siblings(
  count: number,
  views: number | ((index: number) => number),
  overrides: Partial<UploadVideo> = {}
): UploadVideo[] {
  return Array.from({ length: count }, (_, index) =>
    upload({
      id: `sib-${index}`,
      publishedAt: new Date(TARGET_DATE.getTime() - (index + 1) * 86_400_000),
      views: typeof views === "function" ? views(index) : views,
      ...overrides,
    })
  );
}

describe("median", () => {
  it("returns the middle value for odd counts", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the two middle values for even counts", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("handles a single value", () => {
    expect(median([42])).toBe(42);
  });

  it("is not affected by a single extreme value the way a mean is", () => {
    expect(median([100, 110, 120, 130, 10_000_000])).toBe(120);
  });

  it("throws instead of inventing a value for an empty list", () => {
    expect(() => median([])).toThrow(/at least one value/);
  });
});

describe("classifyFormat", () => {
  it("treats videos up to 180 s as Shorts", () => {
    expect(classifyFormat({ durationSeconds: 45 })).toBe("short");
    expect(classifyFormat({ durationSeconds: 180 })).toBe("short");
  });

  it("treats anything over 180 s as long-form", () => {
    expect(classifyFormat({ durationSeconds: 181 })).toBe("long-form");
    expect(classifyFormat({ durationSeconds: 3600 })).toBe("long-form");
  });

  it("classifies live and upcoming broadcasts as live regardless of duration", () => {
    expect(
      classifyFormat({ durationSeconds: 7200, liveBroadcastContent: "live" })
    ).toBe("live");
    expect(
      classifyFormat({ durationSeconds: 30, liveBroadcastContent: "upcoming" })
    ).toBe("live");
    expect(
      classifyFormat({ durationSeconds: 5400, hasLiveStreamingDetails: true })
    ).toBe("live");
  });

  it("classifies zero-duration items as live, never as Shorts", () => {
    expect(classifyFormat({ durationSeconds: 0 })).toBe("live");
  });
});

describe("computeRecentMedianOutlier", () => {
  it("compares against the median of comparable recent uploads", () => {
    const target = upload({ id: "target", views: 30_000 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 10_000),
    ]);

    expect(result.status).toBe("ok");
    expect(result.baselineMedianViews).toBe(10_000);
    expect(result.ratio).toBe(3);
    expect(result.sampleSize).toBe(5);
    expect(result.formulaVersion).toBe(RECENT_MEDIAN_FORMULA_VERSION);
  });

  it("excludes the target from its own baseline", () => {
    // Five siblings at 100 views plus a 1,000,000-view target. If the target
    // leaked into the baseline the median would rise above 100.
    const target = upload({ id: "target", views: 1_000_000 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 100),
    ]);

    expect(result.sampleSize).toBe(5);
    expect(result.comparables.map((c) => c.id)).not.toContain("target");
    expect(result.baselineMedianViews).toBe(100);
    expect(result.ratio).toBe(10_000);
  });

  it("keeps Shorts out of a long-form baseline", () => {
    const target = upload({ id: "target", views: 50_000, durationSeconds: 900 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 10_000),
      ...siblings(20, 5_000_000, { durationSeconds: 45 }).map((v, i) => ({
        ...v,
        id: `short-${i}`,
      })),
    ]);

    expect(result.format).toBe("long-form");
    expect(result.sampleSize).toBe(5);
    expect(result.baselineMedianViews).toBe(10_000);
    expect(result.ratio).toBe(5);
  });

  it("builds a Shorts baseline from Shorts only", () => {
    const target = upload({ id: "target", views: 200_000, durationSeconds: 40 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(6, 50_000, { durationSeconds: 50 }),
      ...siblings(6, 1_000).map((v, i) => ({ ...v, id: `long-${i}` })),
    ]);

    expect(result.format).toBe("short");
    expect(result.sampleSize).toBe(6);
    expect(result.baselineMedianViews).toBe(50_000);
    expect(result.ratio).toBe(4);
  });

  it("keeps livestreams out of a long-form baseline", () => {
    const target = upload({ id: "target", views: 20_000 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 10_000),
      ...siblings(10, 1, { hasLiveStreamingDetails: true }).map((v, i) => ({
        ...v,
        id: `live-${i}`,
      })),
    ]);

    expect(result.sampleSize).toBe(5);
    expect(result.baselineMedianViews).toBe(10_000);
  });

  it("reports insufficient_sample below the minimum and does not guess a ratio", () => {
    const target = upload({ id: "target", views: 500_000 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(BASELINE_MIN_SAMPLE - 1, 1_000),
    ]);

    expect(result.status).toBe("insufficient_sample");
    expect(result.ratio).toBeNull();
    expect(result.baselineMedianViews).toBeNull();
    expect(result.sampleSize).toBe(BASELINE_MIN_SAMPLE - 1);
    expect(result.explanation).toMatch(/required/);
  });

  it("reports insufficient_sample for a brand-new channel with no other uploads", () => {
    const target = upload({ id: "target", views: 12 });
    const result = computeRecentMedianOutlier(target, [target]);

    expect(result.status).toBe("insufficient_sample");
    expect(result.sampleSize).toBe(0);
    expect(result.comparables).toEqual([]);
    expect(result.windowStart).toBe("");
  });

  it("excludes uploads published outside the comparison window", () => {
    const target = upload({ id: "target", views: 10_000 });
    const old = siblings(10, 1_000).map((v, i) => ({
      ...v,
      id: `old-${i}`,
      publishedAt: new Date(TARGET_DATE.getTime() - (400 + i) * 86_400_000),
    }));
    const result = computeRecentMedianOutlier(target, [target, ...old]);

    expect(result.status).toBe("insufficient_sample");
    expect(result.sampleSize).toBe(0);
  });

  it("includes uploads published after the target, not just before it", () => {
    const target = upload({ id: "target", views: 8_000 });
    const later = siblings(5, 2_000).map((v, i) => ({
      ...v,
      id: `later-${i}`,
      publishedAt: new Date(TARGET_DATE.getTime() + (i + 1) * 86_400_000),
    }));
    const result = computeRecentMedianOutlier(target, [target, ...later]);

    expect(result.status).toBe("ok");
    expect(result.sampleSize).toBe(5);
    expect(result.ratio).toBe(4);
  });

  it("caps the sample at the uploads closest in publish date", () => {
    // 30 candidates: the nearest 20 have 1,000 views, the furthest 10 have
    // 1,000,000. Only the nearest 20 may enter the baseline.
    const target = upload({ id: "target", views: 5_000 });
    const candidates = siblings(30, (index) => (index < 20 ? 1_000 : 1_000_000));
    const result = computeRecentMedianOutlier(target, [target, ...candidates]);

    expect(result.sampleSize).toBe(20);
    expect(result.baselineMedianViews).toBe(1_000);
    expect(result.ratio).toBe(5);
  });

  it("reports zero_baseline rather than dividing by zero", () => {
    const target = upload({ id: "target", views: 1_000 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 0),
    ]);

    expect(result.status).toBe("zero_baseline");
    expect(result.ratio).toBeNull();
    expect(result.baselineMedianViews).toBe(0);
  });

  it("returns a real 0 ratio for a target with zero views", () => {
    const target = upload({ id: "target", views: 0 });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 10_000),
    ]);

    expect(result.status).toBe("ok");
    expect(result.ratio).toBe(0);
  });

  it("excludes uploads whose view count YouTube withholds and counts them", () => {
    const target = upload({ id: "target", views: 30_000 });
    const hidden = siblings(3, 0).map((v, i) => ({
      ...v,
      id: `hidden-${i}`,
      views: null,
    }));
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 10_000),
      ...hidden,
    ]);

    expect(result.excludedUnavailable).toBe(3);
    expect(result.sampleSize).toBe(5);
    expect(result.baselineMedianViews).toBe(10_000);
    expect(result.ratio).toBe(3);
  });

  it("reports target_views_unavailable when the target has no view count", () => {
    const target = upload({ id: "target", views: null });
    const result = computeRecentMedianOutlier(target, [
      target,
      ...siblings(5, 10_000),
    ]);

    expect(result.status).toBe("target_views_unavailable");
    expect(result.ratio).toBeNull();
    expect(result.baselineMedianViews).toBe(10_000);
  });

  it("is reproducible: the same inputs give the same ratio and sample", () => {
    const target = upload({ id: "target", views: 30_000 });
    const uploads = [target, ...siblings(9, (i) => 10_000 + i * 137)];
    const first = computeRecentMedianOutlier(target, uploads);
    const second = computeRecentMedianOutlier(target, [...uploads].reverse());

    expect(second.ratio).toBe(first.ratio);
    expect(second.baselineMedianViews).toBe(first.baselineMedianViews);
    expect(second.comparables.map((c) => c.id).sort()).toEqual(
      first.comparables.map((c) => c.id).sort()
    );
  });
});

describe("legacyLifetimeAverageRatio", () => {
  it("computes the old ratio when a lifetime average exists", () => {
    expect(legacyLifetimeAverageRatio(1_000, 250)).toBe(4);
  });

  it("returns null rather than 0 when the average is unknown or zero", () => {
    expect(legacyLifetimeAverageRatio(1_000, null)).toBeNull();
    expect(legacyLifetimeAverageRatio(1_000, 0)).toBeNull();
  });
});

describe("parseVideoId", () => {
  it("accepts the URL shapes YouTube actually produces", () => {
    const cases: [string, string][] = [
      ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://youtu.be/dQw4w9WgXcQ?si=abc123", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "dQw4w9WgXcQ"],
      ["youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
      ["  dQw4w9WgXcQ  ", "dQw4w9WgXcQ"],
    ];
    for (const [input, expected] of cases) {
      expect(parseVideoId(input), input).toBe(expected);
    }
  });

  it("returns null for things that are not YouTube videos", () => {
    const cases = [
      "",
      "   ",
      "not a url",
      "https://vimeo.com/123456",
      "https://www.youtube.com/@somechannel",
      "https://www.youtube.com/watch?v=tooshort",
      "https://www.youtube.com/playlist?list=PL123",
    ];
    for (const input of cases) {
      expect(parseVideoId(input), input).toBeNull();
    }
  });
});

/** Snapshot `hours` after 2026-06-01T00:00Z. */
function at(hours: number, views: number | null) {
  return { views, collectedAt: new Date(Date.parse("2026-06-01T00:00:00Z") + hours * 3_600_000) };
}

describe("measureVelocity", () => {
  it("measures over the exact observed interval, not lifetime views divided by age", () => {
    const result = measureVelocity([at(0, 1_000), at(26, 1_650)]);
    expect(result.daily).toMatchObject({
      viewChange: 650,
      intervalHours: 26,
      viewsPer24Hours: 600,
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-02T02:00:00.000Z",
    });
  });

  it("pairs the latest observation with the one nearest 24 hours before it", () => {
    // 96 h of history: the daily reading must use the 22 h-old snapshot, and the
    // multi-day reading the whole span — the two are different measurements.
    const result = measureVelocity([at(0, 1_000), at(48, 4_000), at(74, 5_000), at(96, 5_400)]);
    expect(result.daily).toMatchObject({ intervalHours: 22, viewChange: 400 });
    expect(result.multiDay).toMatchObject({ intervalHours: 96, viewChange: 4_400 });
  });

  it("reports irregular collection as unavailable rather than stretching it to a day", () => {
    const tooClose = measureVelocity([at(0, 1_000), at(6, 1_100)]);
    expect(tooClose.daily).toBeNull();
    expect(tooClose.dailyUnavailable).toMatch(/closest is 6 h/);
    expect(tooClose.multiDay).toBeNull();
    expect(tooClose.multiDayUnavailable).toMatch(/span 6 h/);

    const tooFar = measureVelocity([at(0, 1_000), at(120, 9_000)]);
    expect(tooFar.daily).toBeNull();
    expect(tooFar.dailyUnavailable).toMatch(/closest is 120 h/);
    // A multi-day reading is still available over that same history.
    expect(tooFar.multiDay).toMatchObject({ intervalHours: 120 });
  });

  it("needs two observations that carry a view count", () => {
    for (const points of [[], [at(0, 1_000)], [at(0, null), at(24, 1_500)]]) {
      const result = measureVelocity(points);
      expect(result.daily).toBeNull();
      expect(result.multiDay).toBeNull();
      expect(result.dailyUnavailable).toMatch(/two are required/);
    }
  });

  it("reports a downward revision as measured rather than hiding it", () => {
    const result = measureVelocity([at(0, 5_000), at(24, 4_700)]);
    expect(result.daily).toMatchObject({ viewChange: -300, viewsPer24Hours: -300 });
  });

  it("ignores the order snapshots arrive in", () => {
    const forwards = measureVelocity([at(0, 1_000), at(24, 2_000)]);
    const backwards = measureVelocity([at(24, 2_000), at(0, 1_000)]);
    expect(backwards).toEqual(forwards);
  });
});

describe("ageNormalizedComparison", () => {
  /** One observation per video, all at roughly the same age. */
  function observations(count: number, views: number | ((i: number) => number), ageHours = 100) {
    return Array.from({ length: count }, (_, i) => ({
      videoId: `other-${i}`,
      ageHours,
      views: typeof views === "function" ? views(i) : views,
    }));
  }

  it("compares against what other videos had at the same age", () => {
    const result = ageNormalizedComparison(
      { videoId: "target", ageHours: 100, views: 9_000 },
      observations(5, (i) => [1_000, 2_000, 3_000, 4_000, 5_000][i])
    );
    expect(result.status).toBe("ok");
    expect(result.medianViewsAtComparableAge).toBe(3_000);
    expect(result.ratio).toBe(3);
    expect(result.explanation).toContain("100 h old");
  });

  it("stays unavailable until enough comparable observations exist", () => {
    const result = ageNormalizedComparison(
      { videoId: "target", ageHours: 100, views: 9_000 },
      observations(4, 1_000)
    );
    expect(result.status).toBe("insufficient_comparables");
    expect(result.ratio).toBeNull();
    expect(result.explanation).toMatch(/Only 4 other video/);
  });

  it("excludes observations outside the age tolerance and the target itself", () => {
    const result = ageNormalizedComparison(
      { videoId: "target", ageHours: 100, views: 9_000 },
      [
        ...observations(5, 1_000, 100),
        ...observations(3, 500_000, 900).map((o) => ({ ...o, videoId: `${o.videoId}-old` })),
        { videoId: "target", ageHours: 100, views: 9_000 },
      ]
    );
    expect(result.sampleSize).toBe(5);
    expect(result.medianViewsAtComparableAge).toBe(1_000);
    expect(result.comparables.every((c) => c.videoId !== "target")).toBe(true);
  });

  it("counts a heavily sampled video once, at its closest observation", () => {
    const result = ageNormalizedComparison(
      { videoId: "target", ageHours: 100, views: 1_000 },
      [
        { videoId: "noisy", ageHours: 90, views: 10 },
        { videoId: "noisy", ageHours: 99, views: 40 },
        { videoId: "noisy", ageHours: 110, views: 80 },
        ...observations(4, 1_000),
      ]
    );
    expect(result.sampleSize).toBe(5);
    expect(result.comparables.filter((c) => c.videoId === "noisy")).toEqual([
      { videoId: "noisy", ageHours: 99, views: 40 },
    ]);
  });
});
