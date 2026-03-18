declare module "google-trends-api" {
  interface TrendOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    category?: number;
    resolution?: string;
  }

  function interestOverTime(options: TrendOptions): Promise<string>;
  function interestByRegion(options: TrendOptions): Promise<string>;
  function relatedQueries(options: TrendOptions): Promise<string>;
  function relatedTopics(options: TrendOptions): Promise<string>;

  export {
    interestOverTime,
    interestByRegion,
    relatedQueries,
    relatedTopics,
  };
}
