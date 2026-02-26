export type Role = "admin" | "contractor";

export type AuditAction =
  | "login"
  | "logout"
  | "timer_start"
  | "timer_stop"
  | "entry_create"
  | "entry_edit"
  | "settings_update"
  | "seed_data";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  timezone: string;
}

export interface Contract {
  id: string;
  userId: string;
  hourlyRate: number;
  currency: string;
  activeFromUtc: string;
}

export interface AppSettings {
  defaultContractorUserId: string;
}

export interface ActiveTimer {
  userId: string;
  startedAtUtc: string;
  startedByUserId: string;
  source: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  startAtUtc: string;
  endAtUtc: string;
  durationMinutes: number;
  rateSnapshot: number;
  currency: string;
  amount: number;
  notes?: string;
  source: string;
  edited: boolean;
  lastEditedByRole?: Role;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  timestampUtc: string;
  metadata: Record<string, unknown>;
}

export interface TrackerDb {
  users: User[];
  contracts: Contract[];
  appSettings: AppSettings;
  activeTimers: ActiveTimer[];
  timeEntries: TimeEntry[];
  auditLogs: AuditLog[];
}

export type PeriodPreset = "daily" | "weekly" | "monthly" | "mtd" | "ytd";

export interface DateRange {
  startUtc: string;
  endUtc: string;
}

export interface ReportTotals {
  totalMinutes: number;
  totalHours: number;
  totalAmount: number;
  sessionCount: number;
}

export interface MonthlyBucket {
  monthKey: string;
  totalMinutes: number;
  totalAmount: number;
}

export interface DailyBucket {
  dayKey: string;
  totalMinutes: number;
  totalAmount: number;
}

export interface MtdAverage {
  dayCount: number;
  totalMinutes: number;
  avgMinutesPerDay: number;
  avgHoursPerDay: number;
}

export interface StorageInfo {
  mode: "json-file" | "postgres-json";
  durable: boolean;
  note?: string;
}

export interface DashboardResponse {
  currentUser: User;
  contractor: User;
  contract: Contract;
  activeTimer: ActiveTimer | null;
  range: DateRange & { preset: PeriodPreset; timezone: string; selectedDay?: string | null };
  totals: ReportTotals;
  entries: TimeEntry[];
  auditLogs: AuditLog[];
  monthlyBuckets: MonthlyBucket[];
  dailyBuckets: DailyBucket[];
  mtdAverage: MtdAverage;
  storage: StorageInfo;
}
