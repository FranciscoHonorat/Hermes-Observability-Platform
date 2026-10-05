export interface AgentConfig {
  collectorUrl: string;
  collectInterval: number;
  serviceName: string;
  environment: string;
  host?: string;
  labels?: Record<string, string>;
  apiKey?: string;
}
