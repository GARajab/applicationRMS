export interface RecordItem {
  id: string;
  label: string;            // 1. Label
  status: string;           // 2. Status
  block: string;            // 3. Block
  zone: string;             // 4. Zone
  scheduleStartDate: string; // 5. Schedule start date (ISO string)
  wayleaveNumber: string;   // 6. Wayleave number
  accountNumber: string;    // 7. Account number
  referenceNumber: string;  // 8. Reference Number
  requireUSP: boolean;      // 9. Require USP
  sentToUSPDate?: string;   // 10. Sent to USP Date (ISO string)
  createdAt: string;        // System field
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  avatar?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
}

export enum NotificationType {
  INFO = 'info',
  WARNING = 'warning',
  SUCCESS = 'success',
  ERROR = 'error'
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface SortConfig {
  key: keyof RecordItem;
  direction: 'asc' | 'desc';
}