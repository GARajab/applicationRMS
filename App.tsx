import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from './components/Icons';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { RecordItem, User, AuthState, Notification, NotificationType, SortConfig } from './types';
import { getRecords, addRecord, deleteRecord, updateRecord, seedInitialData } from './services/storageService';
import { supabase } from './services/supabaseClient';

// --- Constants ---
const STATUS_SEQUENCE = [
  "Assign planning",
  "Site Visit",
  "Design",
  "Design Approval",
  "GIS digitalization",
  "Wayleave",
  "Cost estimation",
  "Attach Utilities Drawing",
  "Engineer approval"
];

// --- Helper Functions ---
const parseDateSafe = (value: any): string => {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  return d.toISOString();
};

const parseExcelDate = (value: any): string | undefined => {
  if (!value) return undefined;
  // Handle Excel serial dates if passed as numbers, or strings
  const d = new Date(value);
  return !isNaN(d.getTime()) ? d.toISOString() : undefined;
};

const getStatusColor = (status: string) => {
  const s = status?.trim();
  
  // Specific mappings requested previously + Logic for new sequence
  switch (s) {
    case "Assign planning":
      return 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
    case "Site Visit":
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case "Design":
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
    case "Design Approval":
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300';
    case "GIS digitalization": // GIS Yellow
      return 'bg-yellow-400 text-slate-900 border border-yellow-500';
    case "Wayleave": // Wayleave Red
      return 'bg-red-600 text-white dark:bg-red-500';
    case "Cost estimation":
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
    case "Attach Utilities Drawing":
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case "Engineer approval": // Final step - Green
      return 'bg-emerald-600 text-white dark:bg-emerald-500';
    case "Passed": // Legacy/Archived
      return 'bg-emerald-800 text-white';
    default:
      // Else is black and white font
      return 'bg-slate-900 text-white dark:bg-white dark:text-slate-900';
  }
};

// --- Components ---

// 0. Loading Screen
const LoadingScreen: React.FC = () => (
  <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 z-[100] flex flex-col items-center justify-center animate-fade-in">
    <div className="relative mb-8">
      <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
      <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 animate-bounce-subtle">
        <Icons.Dashboard className="w-10 h-10 text-white animate-pulse" />
      </div>
    </div>
    <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Planning Dashboard</h1>
    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
      <Icons.Spinner className="w-5 h-5 animate-spin text-blue-500" />
      <span className="text-sm font-medium">Initializing system...</span>
    </div>
  </div>
);

// 1. Edit Record Modal
const EditRecordModal: React.FC<{ 
  isOpen: boolean; 
  record: RecordItem | null; 
  onClose: () => void; 
  onSave: (id: string, updates: Partial<RecordItem>) => Promise<void> 
}> = ({ isOpen, record, onClose, onSave }) => {
  const [formData, setFormData] = useState<{ 
    status: string; 
    wayleaveNumber: string; 
    label: string;
    requireUSP: boolean;
    sentToUSPDate: string;
  }>({ 
    status: '', wayleaveNumber: '', label: '', requireUSP: false, sentToUSPDate: ''
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (record) {
      setFormData({ 
        status: record.status, 
        wayleaveNumber: record.wayleaveNumber || '',
        label: record.label || '',
        requireUSP: record.requireUSP || false,
        sentToUSPDate: record.sentToUSPDate ? new Date(record.sentToUSPDate).toISOString().split('T')[0] : ''
      });
    }
  }, [record]);

  const handleSave = async () => {
    if (!record) return;
    setIsSaving(true);
    await onSave(record.id, {
      ...formData,
      sentToUSPDate: formData.sentToUSPDate ? new Date(formData.sentToUSPDate).toISOString() : undefined
    });
    setIsSaving(false);
    onClose();
  };

  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl shadow-2xl flex flex-col animate-scale-in border border-slate-200 dark:border-slate-700">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Edit Record</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            <Icons.Close className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Label / Title</label>
            <input 
              type="text" 
              value={formData.label}
              onChange={(e) => setFormData({...formData, label: e.target.value})}
              className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Wayleave Number</label>
            <input 
              type="text" 
              value={formData.wayleaveNumber}
              onChange={(e) => setFormData({...formData, wayleaveNumber: e.target.value})}
              className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Status</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({...formData, status: e.target.value})}
              className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
            >
              {STATUS_SEQUENCE.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
              {/* Keep fallback for any legacy statuses */}
              {!STATUS_SEQUENCE.includes(formData.status) && formData.status && (
                <option value={formData.status}>{formData.status}</option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-3 py-2 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
            <input 
              type="checkbox" 
              id="requireUSP"
              checked={formData.requireUSP}
              onChange={(e) => setFormData({...formData, requireUSP: e.target.checked})}
              className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="requireUSP" className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">Require USP?</label>
          </div>

          {formData.requireUSP && (
            <div className="animate-fade-in-down">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sent to USP Date</label>
              <input 
                type="date" 
                value={formData.sentToUSPDate}
                onChange={(e) => setFormData({...formData, sentToUSPDate: e.target.value})}
                className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:border-blue-500 outline-none transition-all focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2 shadow-lg shadow-blue-500/30"
          >
            {isSaving ? <Icons.Spinner className="w-4 h-4 animate-spin" /> : <Icons.Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

// 2. Login Component
const Login: React.FC<{ onLogin: (user: User) => void }> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
         const appUser: User = {
           id: data.user.id,
           username: data.user.email?.split('@')[0] || 'User',
           role: 'admin', 
           avatar: '' 
         };
         onLogin(appUser);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4 transition-colors duration-200">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700 animate-fade-in-up">
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/30 animate-bounce-subtle">
            <Icons.Dashboard className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Planning Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Sign in via Supabase</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/50 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-200 text-sm rounded-lg flex items-center gap-2 border border-red-200 dark:border-red-800 animate-shake">
              <Icons.Alert className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 active:scale-95"
          >
            {isLoading ? <Icons.Spinner className="animate-spin w-5 h-5" /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

// 3. Notification Component
interface NotificationProps {
  notification: Notification;
  onClose: (id: string) => void;
  onClick?: (notification: Notification) => void;
}

const NotificationToast: React.FC<NotificationProps> = ({ notification, onClose, onClick }) => {
  const style = {
    [NotificationType.INFO]: 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-100',
    [NotificationType.WARNING]: 'bg-white dark:bg-slate-800 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-100',
    [NotificationType.SUCCESS]: 'bg-white dark:bg-slate-800 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-100',
    [NotificationType.ERROR]: 'bg-white dark:bg-slate-800 border-red-200 dark:border-red-900 text-red-800 dark:text-red-100',
  }[notification.type];

  return (
    <div 
      className={`fixed bottom-4 right-4 z-50 p-4 rounded-xl border shadow-lg max-w-sm w-full animate-slide-in-right ${style} flex items-start gap-3 cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-all`}
      onClick={() => onClick && onClick(notification)}
    >
      <div className="mt-0.5">
        {notification.type === NotificationType.WARNING && <Icons.Alert className="w-5 h-5 text-amber-500" />}
        {notification.type === NotificationType.SUCCESS && <Icons.Check className="w-5 h-5 text-emerald-500" />}
        {notification.type === NotificationType.INFO && <Icons.Bell className="w-5 h-5 text-blue-500" />}
        {notification.type === NotificationType.ERROR && <Icons.Alert className="w-5 h-5 text-red-500" />}
      </div>
      <div className="flex-1">
        <p className="font-medium text-sm">{notification.message}</p>
        <p className="text-xs opacity-60 mt-1">{new Date(notification.timestamp).toLocaleTimeString()}</p>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onClose(notification.id); }} 
        className="opacity-50 hover:opacity-100 p-1"
      >
        <Icons.Close className="w-4 h-4" />
      </button>
    </div>
  );
};

// 5. File Upload (Updated for specific columns)
const ExcelUploader: React.FC<{ onUpload: (data: any[]) => void }> = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFile = (file: File) => {
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (data) {
        setTimeout(() => { // Simulate minimal processing time for animation
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(sheet);
          
          const mappedData = jsonData
            .filter((row: any) => {
              const status = String(row['Status'] || '').trim();
              const excluded = [
                'Pending payment',
                'Cancelled',
                'Canceled', 
                'Chief approval',
                'Head engineer approval'
              ];
              // Case insensitive check for exclusion
              return !excluded.some(ex => ex.toLowerCase() === status.toLowerCase());
            })
            .map((row: any, index) => {
              const requireUSPRaw = String(row['Require USP'] || row['require_usp'] || '').toLowerCase();
              const requireUSP = requireUSPRaw === 'yes' || requireUSPRaw === 'true';

              // Sanitize inputs
              const wayleave = String(row['Wayleave number'] || '').trim();
              const account = String(row['Account number'] || '').trim();
              const ref = String(row['Reference Number'] || '').trim();
              const status = String(row['Status'] || 'Assign planning').trim();

              return {
                label: row['Label'] || row['Title'] || `Imported ${index + 1}`,
                status: status,
                block: row['Block'] || 'N/A',
                zone: row['Zone'] || 'N/A',
                scheduleStartDate: parseDateSafe(row['Schedule start date']),
                wayleaveNumber: wayleave,
                accountNumber: account,
                referenceNumber: ref || `REF-${Date.now()}-${index}`,
                requireUSP: requireUSP,
                sentToUSPDate: parseExcelDate(row['Sent to USP Date']),
                createdAt: new Date().toISOString()
              };
            });
          
          onUpload(mappedData);
          setIsProcessing(false);
        }, 800);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div 
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all bg-white dark:bg-slate-800 group ${
        isDragging ? 'border-blue-500 bg-blue-50 dark:bg-slate-700 scale-[1.02]' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isProcessing ? (
        <div className="py-4 flex flex-col items-center">
          <Icons.Spinner className="w-10 h-10 text-blue-500 animate-spin mb-3" />
          <p className="text-slate-600 dark:text-slate-300 font-medium animate-pulse">Processing Excel file...</p>
        </div>
      ) : (
        <>
          <div className="w-12 h-12 bg-blue-50 dark:bg-slate-700 text-blue-500 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-200 dark:border-slate-600 group-hover:scale-110 transition-transform">
            <Icons.Excel className="w-6 h-6" />
          </div>
          <h3 className="font-semibold text-slate-800 dark:text-white mb-1">Upload Excel File</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Drag & drop or click to select</p>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            className="hidden" 
            id="file-upload"
            onChange={handleChange}
          />
          <label 
            htmlFor="file-upload" 
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-600 shadow-sm transition-all hover:shadow-md active:scale-95"
          >
            <Icons.Upload className="w-4 h-4" /> Select File
          </label>
        </>
      )}
    </div>
  );
};

// 6. Main App Logic
const App: React.FC = () => {
  // State
  const [auth, setAuth] = useState<AuthState>({ isAuthenticated: false, user: null });
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthChecking, setIsAuthChecking] = useState(true); // New state for initial load
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortConfig>({ key: 'createdAt', direction: 'desc' });
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'delayed'>('all');
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || 'light';
    }
    return 'light';
  });

  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);

  // Apply Theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const refreshRecords = async () => {
    setIsLoading(true);
    const data = await getRecords();
    if (data.length === 0) {
      const seeded = await seedInitialData();
      setRecords(seeded);
      checkAgingRecords(seeded);
    } else {
      setRecords(data);
      checkAgingRecords(data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const initAuth = async () => {
       setIsAuthChecking(true);
       const { data } = await supabase.auth.getUser();
       if (data.user) {
         setAuth({
           isAuthenticated: true,
           user: {
             id: data.user.id,
             username: data.user.email?.split('@')[0] || 'User',
             role: 'admin'
           }
         });
         await refreshRecords();
       } 
       setIsAuthChecking(false);
    };
    initAuth();
  }, []);

  const checkAgingRecords = (data: RecordItem[]) => {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const oldPending = data.filter(r => 
      (r.status.toLowerCase() !== 'completed' && r.status !== 'Passed' && r.status !== 'Engineer approval' && r.status.toLowerCase() !== 'archived') && 
      new Date(r.scheduleStartDate).getTime() < sevenDaysAgo
    );

    if (oldPending.length > 0) {
      setNotifications(prev => prev.filter(n => n.type !== NotificationType.WARNING));
      addNotification({
        type: NotificationType.WARNING,
        message: `${oldPending.length} records scheduled > 7 days ago. Click to view.`,
      });
    }
  };

  const addNotification = (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: Notification = {
      ...notif,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.type === NotificationType.WARNING) {
      setFilterMode('delayed');
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      addNotification({
        type: NotificationType.INFO,
        message: "Showing only delayed records."
      });
    }
  };

  const handleLogin = (user: User) => {
    setAuth({ isAuthenticated: true, user });
    refreshRecords();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuth({ isAuthenticated: false, user: null });
  };

  const handleExcelUpload = async (newRecords: RecordItem[]) => {
    setIsLoading(true);
    
    // Fetch fresh records to ensure accurate duplicate and update checking
    const currentRecords = await getRecords();
    
    let addedCount = 0;
    let updatedCount = 0;
    let ignoredCount = 0;

    for (const newRecord of newRecords) {
      // Logic for detecting existing records:
      // 1. Matches an existing Reference Number
      // 2. Matches an existing Wayleave Number (if provided and not empty)
      const existingRecord = currentRecords.find(existing => {
        const isRefMatch = existing.referenceNumber && 
                           newRecord.referenceNumber && 
                           existing.referenceNumber === newRecord.referenceNumber;
        
        const isWayleaveMatch = existing.wayleaveNumber && 
                               newRecord.wayleaveNumber && 
                               newRecord.wayleaveNumber !== '' && 
                               existing.wayleaveNumber === newRecord.wayleaveNumber;
        
        return isRefMatch || isWayleaveMatch;
      });

      if (existingRecord) {
        // Logic: Only update status if new status is "higher" in sequence than old status
        const oldStatusIndex = STATUS_SEQUENCE.indexOf(existingRecord.status);
        const newStatusIndex = STATUS_SEQUENCE.indexOf(newRecord.status);

        if (newStatusIndex > -1 && newStatusIndex > oldStatusIndex) {
          // Update status
          await updateRecord(existingRecord.id, { status: newRecord.status });
          updatedCount++;
        } else {
          // Status is older or same, or unknown -> Ignore
          ignoredCount++;
        }
      } else {
        // New Record
        await addRecord(newRecord);
        addedCount++;
      }
    }
    
    await refreshRecords();
    setShowUpload(false);
    
    let message = '';
    if (addedCount > 0) message += `Added ${addedCount} new. `;
    if (updatedCount > 0) message += `Updated status for ${updatedCount}. `;
    if (ignoredCount > 0) message += `Ignored ${ignoredCount} (duplicates/older status).`;
    
    addNotification({
      type: (addedCount > 0 || updatedCount > 0) ? NotificationType.SUCCESS : NotificationType.INFO,
      message: message.trim() || "No changes made.",
    });

    setIsLoading(false);
  };

  const handleUpdateRecord = async (id: string, updates: Partial<RecordItem>) => {
    const success = await updateRecord(id, updates);
    if (success) {
      setRecords(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
      addNotification({
        type: NotificationType.SUCCESS,
        message: 'Record updated successfully.',
      });
    } else {
      addNotification({
        type: NotificationType.ERROR,
        message: 'Failed to update record.',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this record?')) {
      const success = await deleteRecord(id);
      if (success) {
        setRecords(prev => prev.filter(r => r.id !== id));
        addNotification({
          type: NotificationType.INFO,
          message: 'Record deleted.',
        });
      }
    }
  };

  // Filter & Sort Logic
  const filteredRecords = useMemo(() => {
    let result = records;

    // Search always searches the full database (including Passed/Archived)
    if (search.trim()) {
       result = result.filter(r => 
        r.label.toLowerCase().includes(search.toLowerCase()) ||
        r.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.wayleaveNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.accountNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.zone.toLowerCase().includes(search.toLowerCase())
      );
    } else {
      // If not searching, apply normal filters
      if (filterMode === 'delayed') {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        result = result.filter(r => 
          (r.status !== 'Engineer approval' && r.status !== 'Passed') && 
          new Date(r.scheduleStartDate).getTime() < sevenDaysAgo
        );
      } else {
        // Default view: Hide 'Passed' (Archived) but show all others
        result = result.filter(r => r.status !== 'Passed');
      }
    }

    result.sort((a, b) => {
      const aValue = a[sort.key];
      const bValue = b[sort.key];
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue < bValue) return sort.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [records, search, sort, filterMode]);

  // Chart Data
  const statusData = useMemo(() => {
    const counts = records.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Ensure all steps are represented in the chart even if 0, for clarity
    return STATUS_SEQUENCE.map(step => ({
      name: step,
      value: counts[step] || 0
    })).filter(item => item.value > 0); // Optional: filter out 0s if chart is too crowded
  }, [records]);

  const zoneData = useMemo(() => {
    const counts = records.reduce((acc, r) => {
      acc[r.zone] = (acc[r.zone] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [records]);

  // Initial Auth Loading Screen
  if (isAuthChecking) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex font-sans overflow-x-hidden transition-colors duration-200">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 flex flex-col border-r border-slate-200 dark:border-slate-800
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
      `}>
        <div className="p-6 flex items-center gap-3 text-slate-800 dark:text-white border-b border-slate-200 dark:border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Icons.Dashboard className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Planning Dashboard</span>
          <button 
            onClick={() => setIsMobileMenuOpen(false)} 
            className="lg:hidden ml-auto text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <Icons.Close className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => { setFilterMode('all'); setShowUpload(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${filterMode === 'all' && !showUpload ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
          >
            <Icons.Dashboard className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </button>
          <button 
            onClick={() => setShowUpload(true)} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${showUpload ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
          >
            <Icons.Excel className="w-5 h-5" />
            <span className="font-medium">Import Data</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
              <Icons.User className="w-5 h-5 text-slate-500 dark:text-slate-300" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-slate-900 dark:text-white font-medium truncate">{auth.user?.username}</p>
              <p className="text-xs text-slate-500 capitalize">{auth.user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors px-2 text-sm font-medium">
            <Icons.Logout className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 p-4 md:p-8 w-full transition-all duration-300 ${isMobileMenuOpen ? 'lg:ml-64' : 'ml-0 lg:ml-64'}`}>
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <Icons.Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white animate-fade-in">
                {filterMode === 'delayed' ? 'Delayed Jobs' : 'Dashboard Overview'}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm animate-fade-in-up">
                {filterMode === 'delayed' ? 'Viewing records scheduled > 7 days ago' : "Welcome back, here's what's happening today."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
              onClick={toggleTheme}
              className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-yellow-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Icons.Sun className="w-5 h-5" /> : <Icons.Moon className="w-5 h-5" />}
            </button>

            {filterMode === 'delayed' && (
              <button 
                onClick={() => setFilterMode('all')}
                className="px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                <Icons.Close className="w-4 h-4" /> Clear Filter
              </button>
            )}
            <div className="relative flex-1 md:flex-none">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Search label, ref, wayleave..." 
                className="pl-10 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none w-full md:w-64 transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 relative hover:scale-105 transition-transform">
              <Icons.Bell className="w-5 h-5" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Records', value: records.length, icon: Icons.Excel, color: 'blue' },
            { label: 'Assign planning', value: records.filter(r => r.status === 'Assign planning').length, icon: Icons.Clock, color: 'slate' },
            { label: 'Completed', value: records.filter(r => r.status === 'Engineer approval').length, icon: Icons.Check, color: 'emerald' },
            { label: 'In Design', value: records.filter(r => r.status.includes('Design')).length, icon: Icons.Edit, color: 'indigo' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-blue-400 dark:hover:border-slate-600 transition-all hover:shadow-lg hover:-translate-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{stat.label}</p>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{stat.value}</h3>
                </div>
                <div className={`p-3 rounded-xl bg-${stat.color}-50 dark:bg-${stat.color}-900/30 text-${stat.color}-600 dark:text-${stat.color}-400`}>
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Upload Area (Conditional) */}
        {showUpload && (
          <div className="mb-8 animate-fade-in-down">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Import Records</h3>
              <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-transform hover:rotate-90">
                <Icons.Close className="w-5 h-5" />
              </button>
            </div>
            <ExcelUploader onUpload={handleExcelUpload} />
          </div>
        )}

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* List Section */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col overflow-hidden h-[600px] animate-fade-in-up">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800 sticky top-0 z-10">
              <h2 className="font-bold text-slate-900 dark:text-white">
                {filterMode === 'delayed' ? 'Delayed Jobs' : 'Record List'}
              </h2>
              <div className="flex gap-2">
                 <select 
                    className="text-sm border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-white rounded-lg px-3 py-1 outline-none focus:ring-2 focus:ring-blue-500/30"
                    onChange={(e) => setSort({ key: e.target.value as keyof RecordItem, direction: 'desc' })}
                 >
                   <option value="createdAt">Created</option>
                   <option value="scheduleStartDate">Scheduled</option>
                   <option value="status">Status</option>
                   <option value="zone">Zone</option>
                 </select>
              </div>
            </div>
            <div className="overflow-x-auto overflow-y-auto flex-1">
              {isLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                  <Icons.Spinner className="animate-spin w-8 h-8 text-blue-500" /> 
                  <span className="animate-pulse">Loading records...</span>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-medium sticky top-0">
                    <tr>
                      <th className="px-6 py-4 w-16">#</th>
                      <th className="px-6 py-4">Reference</th>
                      <th className="px-6 py-4">Label</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">USP Status</th>
                      <th className="px-6 py-4">Scheduled</th>
                      <th className="px-6 py-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredRecords.map((record, index) => (
                      <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group">
                        <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-500">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-slate-600 dark:text-slate-400">
                          {record.referenceNumber}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900 dark:text-white">{record.label}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-500">Zone: {record.zone}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold capitalize shadow-sm ${getStatusColor(record.status)}`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                           {record.requireUSP ? (
                             <div className="flex flex-col gap-1">
                               <span className="text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 px-2 py-0.5 rounded w-fit animate-pulse-slow">
                                 Required
                               </span>
                               {record.sentToUSPDate ? (
                                 <span className="text-xs text-slate-500 dark:text-slate-400">
                                   Sent: {new Date(record.sentToUSPDate).toLocaleDateString()}
                                 </span>
                               ) : (
                                 <span className="text-xs text-amber-600 dark:text-amber-500 font-medium">Not Sent</span>
                               )}
                             </div>
                           ) : (
                             <span className="text-slate-400 text-sm">-</span>
                           )}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-500 text-sm">
                          {new Date(record.scheduleStartDate).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 flex gap-2">
                           <button 
                            onClick={() => setEditingRecord(record)}
                            className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors group-hover:opacity-100 lg:opacity-0"
                            title="Edit Record"
                          >
                            <Icons.Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(record.id)}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors group-hover:opacity-100 lg:opacity-0"
                            title="Delete Record"
                          >
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filteredRecords.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                          No records found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Analytics Section */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-80 flex flex-col animate-fade-in-up" style={{animationDelay: '0.1s'}}>
              <h3 className="font-bold text-slate-900 dark:text-white mb-6">Status Distribution</h3>
              <div className="w-full h-64">
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 10}} dy={10} angle={-15} textAnchor="end" />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12}} />
                      <Tooltip 
                        cursor={{fill: theme === 'dark' ? '#1e293b' : '#f1f5f9'}}
                        contentStyle={{
                           borderRadius: '8px', 
                           border: theme === 'dark' ? '1px solid #475569' : 'none', 
                           backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', 
                           color: theme === 'dark' ? '#f8fafc' : '#1e293b',
                           boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {statusData.map((entry, index) => (
                          // Mapped colors consistent with sequence
                          <Cell key={`cell-${index}`} fill={[
                            '#e2e8f0', // Assign Planning (Slate)
                            '#dbeafe', // Site Visit (Blue)
                            '#e0e7ff', // Design (Indigo)
                            '#cffafe', // Design Approval (Cyan)
                            '#facc15', // GIS (Yellow)
                            '#dc2626', // Wayleave (Red)
                            '#ffedd5', // Cost (Orange)
                            '#f3e8ff', // Utilities (Purple)
                            '#059669'  // Engineer Approval (Emerald)
                          ][index % 9]} />
                        ))}
                      </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>
            </div>

            {/* Zone Chart */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm h-80 flex flex-col animate-fade-in-up" style={{animationDelay: '0.2s'}}>
              <h3 className="font-bold text-slate-900 dark:text-white mb-2">Zone Activity</h3>
               <div className="w-full h-64">
                 <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={zoneData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        fill="#8884d8"
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {zoneData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'][index % 4]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{
                           borderRadius: '8px', 
                           border: theme === 'dark' ? '1px solid #475569' : 'none', 
                           backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', 
                           color: theme === 'dark' ? '#f8fafc' : '#1e293b',
                           boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                        }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{color: theme === 'dark' ? '#94a3b8' : '#64748b'}} />
                    </PieChart>
                 </ResponsiveContainer>
               </div>
            </div>
          </div>
        </div>
      </main>

      {/* Overlays */}
      <EditRecordModal 
         isOpen={!!editingRecord} 
         record={editingRecord} 
         onClose={() => setEditingRecord(null)} 
         onSave={handleUpdateRecord} 
      />
      
      {notifications.map(notif => (
        <NotificationToast 
          key={notif.id} 
          notification={notif} 
          onClose={(id) => setNotifications(prev => prev.filter(n => n.id !== id))} 
          onClick={handleNotificationClick}
        />
      ))}
      
      {/* Animation Styles */}
      <style>{`
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes bounceSubtle { 0%, 100% { transform: translateY(-3px); } 50% { transform: translateY(3px); } }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        
        .animate-fade-in-down { animation: fadeInDown 0.3s ease-out forwards; }
        .animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slide-in-right { animation: slideInRight 0.3s ease-out forwards; }
        .animate-scale-in { animation: scaleIn 0.2s ease-out forwards; }
        .animate-bounce-subtle { animation: bounceSubtle 2s infinite ease-in-out; }
        .animate-shake { animation: shake 0.4s ease-in-out; }
        .animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>
    </div>
  );
};

export default App;