export const FolderAction = {
  CREATE: "create",
  ADD_VIDEO: "addVideo",
  REMOVE_VIDEO: "removeVideo",
} as const;

export const PanelAction = {
  CREATE: "create",
  REFRESH: "refresh",
} as const;

export const TrendAction = {
  INTEREST_OVER_TIME: "interestOverTime",
  RELATED_QUERIES: "relatedQueries",
  REGIONAL_INTEREST: "regionalInterest",
} as const;

export const KeywordMode = {
  DEFAULT: "default",
  BRAINSTORM: "brainstorm",
} as const;
