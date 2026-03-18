export interface VideoResult {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  publishedAt: string;
  thumbnailUrl: string;
  description: string;
  outlierScore: number | null;
  viewsPerHour: number | null;
  channelSubscribers: number | null;
  channelAverageViews: number | null;
  engagementRate: number | null;
  viewsToSubsRatio: number | null;
}

export interface SearchFilters {
  keyword: string;
  maxSubscribers?: number;
  minViews?: number;
  minDuration?: number;
  maxDuration?: number;
  videoType?: "any" | "short" | "long";
  publishedAfter?: string;
  publishedBefore?: string;
  language?: string;
  maxResults?: number;
  minEngagement?: number;
}

export interface Folder {
  id: number;
  name: string;
  _count: { videos: number };
}

export interface FolderBasic {
  id: number;
  name: string;
}
