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
  justification?: string;   // 11. Justification for suspension
  createdAt: string;        // System field

  // New Fields
  applicationNumber?: string;
  bpRequestNumber?: string;
  versionNumber?: string;
  constructionType?: string;
  ewaFeeStatus?: string;
  applicationStatus?: string; // Distinct from internal 'status'
  landOwnerId?: string;
  ownerNameEn?: string;
  ownerNameAr?: string;
  numberOfAddresses?: string;
  mouGatedCommunity?: string;
  buildingNumber?: string;
  roadNumber?: string;
  plotNumber?: string; // Parcel / Plot number
  titleDeed?: string;
  buildableArea?: string;
  momaaLoad?: string;
  applicationDate?: string; // Date
  nationality?: string;
  propertyCategory?: string;
  usageNature?: string;
  investmentZone?: string;
  initialPaymentDate?: string;
  secondPayment?: string;
  thirdPayment?: string;
  errorLog?: string;
  partialExemption?: string;
}

export interface InfraReferenceItem {
  id: string;
  applicationNumber?: string;
  bpRequestNumber?: string;
  versionNumber?: string;
  constructionType?: string;
  ewaFeeStatus?: string;
  applicationStatus?: string;
  accountNumber?: string;
  landOwnerId?: string;
  ownerNameEn?: string;
  ownerNameAr?: string;
  numberOfAddresses?: string;
  mouGatedCommunity?: string;
  buildingNumber?: string;
  blockNumber?: string;
  roadNumber?: string;
  plotNumber?: string;
  titleDeed?: string;
  buildableArea?: string;
  momaaLoad?: string;
  date?: string;
  nationality?: string;
  propCategory?: string;
  usageNature?: string;
  investmentZone?: string;
  initialPaymentDate?: string;
  secondPayment?: string;
  thirdPayment?: string;
  errorLog?: string;
  partialExemption?: string;
  createdAt: string;
  
  // Frontend helper
  _searchablePlot?: string;
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