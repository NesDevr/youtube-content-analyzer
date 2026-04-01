import googleTrends from "google-trends-api";

// In-memory cache with 24h TTL to avoid redundant Google Trends API calls
const trendsCache = new Map<string, { data: unknown; timestamp: number }>();
const TRENDS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCached<T>(key: string): T | null {
  const entry = trendsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TRENDS_TTL_MS) {
    trendsCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: unknown): void {
  trendsCache.set(key, { data, timestamp: Date.now() });
}

export interface TrendData {
  date: string;
  value: number;
}

export interface TrendResult {
  keyword: string;
  data: TrendData[];
}

export interface RelatedQuery {
  query: string;
  value: number | string;
}

export async function getInterestOverTime(
  keywords: string[],
  timeRange: "now 7-d" | "today 1-m" | "today 3-m" | "today 12-m" | "today 5-y" = "today 12-m"
): Promise<TrendResult[]> {
  const cacheKey = `iot:${keywords.sort().join(",")}:${timeRange}`;
  const cached = getCached<TrendResult[]>(cacheKey);
  if (cached) return cached;

  try {
    const result = await googleTrends.interestOverTime({
      keyword: keywords,
      startTime: getStartTime(timeRange),
      geo: "",
    });

    const parsed = JSON.parse(result);
    const timeline = parsed.default?.timelineData || [];

    const results = keywords.map((kw, idx) => ({
      keyword: kw,
      data: timeline.map(
        (point: { formattedTime: string; value: number[] }) => ({
          date: point.formattedTime,
          value: point.value[idx] || 0,
        })
      ),
    }));
    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.error("Google Trends error:", error);
    return keywords.map((kw) => ({ keyword: kw, data: [] }));
  }
}

export async function getRelatedQueries(
  keyword: string
): Promise<{ rising: RelatedQuery[]; top: RelatedQuery[] }> {
  const cacheKey = `rq:${keyword}`;
  const cached = getCached<{ rising: RelatedQuery[]; top: RelatedQuery[] }>(cacheKey);
  if (cached) return cached;

  try {
    const result = await googleTrends.relatedQueries({ keyword });
    const parsed = JSON.parse(result);
    const data = parsed.default?.rankedList || [];

    const results = {
      top: (data[0]?.rankedKeyword || []).map(
        (item: { query: string; value: number }) => ({
          query: item.query,
          value: item.value,
        })
      ),
      rising: (data[1]?.rankedKeyword || []).map(
        (item: { query: string; value: number | string }) => ({
          query: item.query,
          value: item.value,
        })
      ),
    };
    setCache(cacheKey, results);
    return results;
  } catch (error) {
    console.error("Related queries error:", error);
    return { rising: [], top: [] };
  }
}

export async function getRegionalInterest(
  keyword: string
): Promise<{ geoCode: string; geoName: string; value: number }[]> {
  try {
    const result = await googleTrends.interestByRegion({
      keyword,
      resolution: "COUNTRY",
    });
    const parsed = JSON.parse(result);
    return (parsed.default?.geoMapData || []).map(
      (item: { geoCode: string; geoName: string; value: number[] }) => ({
        geoCode: item.geoCode,
        geoName: item.geoName,
        value: item.value[0] || 0,
      })
    );
  } catch (error) {
    console.error("Regional interest error:", error);
    return [];
  }
}

function getStartTime(range: string): Date {
  const now = new Date();
  switch (range) {
    case "now 7-d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "today 1-m":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "today 3-m":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "today 12-m":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case "today 5-y":
      return new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    default:
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}
