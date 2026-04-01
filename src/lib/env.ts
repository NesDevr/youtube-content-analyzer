function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const YOUTUBE_API_KEY = requireEnv("YOUTUBE_API_KEY");
export const GOOGLE_PROJECT_ID = requireEnv("GOOGLE_PROJECT_ID");
export const GOOGLE_CLOUD_LOCATION = requireEnv("GOOGLE_CLOUD_LOCATION");
