export interface RecordItem {
  id: string;
  label: string;            // Label
  subtype?: string;         // Subtype
  type?: string;            // Type
  status: string;           // Status
  phase?: string;           // Phase
  block: string;            // Block
  zone: string;             // Zone
  scheduleStartDate: string; // Schedule start date
  scheduleEndDate?: string;  // Schedule end date
  userConnected?: string;    // User connected
  createdBy?: string;        // Created by
  capitalContribution?: string; // Capital contribution
  nominatedContractor?: string; // Nominated contractor
  urgent?: boolean;          // Urgent
  lastShutdown?: string;     // Last shutdown
  planningEngineer?: string; // Planning engineer assigned
  constructionEngineer?: string; // Construction engineer assigned
  supervisor?: string;       // Supervisor assigned
  wayleaveNumber: string;    // Wayleave number
  plannedTotalCost?: string; // Planned total cost
  plannedMaterialCost?: string; // Planned material cost
  plannedServiceCost?: string;  // Planned service cost
  paymentDate?: string;      // Payment date
  totalPower?: string;       // Total power
  contractorAssignDate?: string; // Contractor assign date
  workOrder?: string;        // IO/ Work Order
  plotNumber?: string;       // Plot Number
  accountNumber: string;     // Account number
  customerCpr?: string;      // Customer CPR
  referenceNumber: string;   // Reference Number
  jobType?: string;          // Job type
  governorate?: string;      // Governorate
  nasCode?: string;          // NAS Code
  description?: string;      // Description
  mtcContractor?: string;    // MTC Contractor
  workflowEntryDate?: string; // Workflow entry state date
  contractorPaymentDate?: string; // Contractor Payment Date
  installationContractor?: string; // Installation contractor
  
  // Existing fields kept for compatibility or internal logic
  requireUSP: boolean;
  sentToUSPDate?: string;
  justification?: string;
  createdAt: string;

  // Additional fields from previous requirements (kept for safety)
  applicationNumber?: string;
  bpRequestNumber?: string;
  versionNumber?: string;
  constructionType?: string;
  ewaFeeStatus?: string;
  applicationStatus?: string;
  landOwnerId?: string;
  ownerNameEn?: string;
  ownerNameAr?: string;
  numberOfAddresses?: string;
  mouGatedCommunity?: string;
  buildingNumber?: string;
  roadNumber?: string;
  titleDeed?: string;
  buildableArea?: string;
  momaaLoad?: string;
  applicationDate?: string;
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