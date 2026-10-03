export interface Analytics {
  conversations: { total: number; open: number; pending: number; resolved: number; closed: number };
  customers: number;
  messages: { total: number; inbound: number; outbound: number; byAI: number; byAgent: number };
  firstResponse: { averageSeconds: number | null; aiAverageSeconds: number | null; agentAverageSeconds: number | null; sampleSize: number };
  daily: { date: string; inbound: number; outbound: number }[];
  timezone: string;
}
