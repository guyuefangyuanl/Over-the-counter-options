export type MarketIndex = {
  code: string;
  name: string;
  value: number;
  change: number; // percentage
};

export type Announcement = {
  id: string;
  title: string;
  timestamp: string;
};

export type Stock = {
  code: string;
  name: string;
  price: number;
  change: number; // percentage
};

export type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};