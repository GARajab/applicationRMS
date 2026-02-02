import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from './components/Icons';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { RecordItem, User, AuthState, Notification as AppNotification, NotificationType, SortConfig } from './types';
import { getRecords, addRecord, deleteRecord, updateRecord, seedInitialData } from './services/storageService';
import { supabase } from './services/supabaseClient';

// --- Constants ---
// Priority Order: 1 (Lowest Index) to 12 (Highest Index)
const STATUS_SEQUENCE = [
  "Assign planning",          // 1
  "Site Visit",               // 2
  "Design",                   // 3
  "Design approval",          // 4
  "GIS digitalization",       // 5
  "Wayleave",                 // 6
  "Cost estimation",          // 7
  "Attach Utilities Drawing", // 8
  "Engineer approval",        // 9
  "Redesign",                 // 10
  "Suspended by EDD",         // 11
  "Work Design",              // 12
  "Cancelled"                 // Optional: Terminal state, highest priority to prevent overwrite by lower statuses
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

// Normalize status string for comparison
const normalizeStatus = (s: string) => s.trim().toLowerCase();

// Modern Color Mapping
const getStatusColor = (status: string) => {
  const s = normalizeStatus(status);
  
  if (s === 'passed' || s === 'engineer approval' || s === 'work design' || s === 'design approval') {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
  }
  
  if (s === 'suspended by edd') {
    return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 animate-pulse';
  }

  if (s === 'cancelled' || s === 'canceled') {
    return 'bg-slate-200 text-slate-700 border border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600 animate-pulse';
  }

  if (s.includes('gis')) {
    return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
  }
  
  if (s.includes('wayleave')) {
    return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
  }

  if (s === 'redesign') {
    return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20';
  }
  
  return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
};

// Chart Color Mapping
const getChartColor = (status: string, theme: 'light' | 'dark') => {
  const s = normalizeStatus(status);
  
  if (s === 'passed' || s === 'engineer approval' || s === 'work design' || s === 'design approval') {
    return '#10b981'; // emerald-500
  }
  if (s === 'suspended by edd') {
    return '#ef4444'; // red-500
  }
  if (s === 'cancelled' || s === 'canceled') {
    return theme === 'dark' ? '#475569' : '#94a3b8'; // slate-500/400
  }
  if (s.includes('gis')) {
    return '#f59e0b'; // amber-500
  }
  if (s.includes('wayleave')) {
    return '#f43f5e'; // rose-500
  }
  if (s === 'redesign') {
    return '#a855f7'; // purple-500
  }
  // Else: Slate
  return theme === 'dark' ? '#94a3b8' : '#475569';
};

// --- Components ---

// 0. Loading Screen
const LoadingScreen: React.FC = () => (
  <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 z-[100] flex flex-col items-center justify-center animate-fade-in">
    <div className="relative mb-8">
      <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
      <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 animate-bounce-subtle">
        <Icons.Dashboard className="w-10 h-10 text-white animate-pulse" />
      </div>
    </div>
    <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Planning Dashboard</h1>
    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
      <Icons.Spinner className="w-5 h-5 animate-spin text-emerald-500" />
      <span className="text-sm font-medium">Initializing system...</span>
    </div>
  </div>
);

// 1. Edit Record Modal (Expanded with Full Details)
const EditRecordModal: React.FC<{ 
  isOpen: boolean; 
  record: RecordItem | null; 
  onClose: () => void; 
  onSave: (id: string, updates: Partial<RecordItem>) => Promise<void> 
}> = ({ isOpen, record, onClose, onSave }) => {
  const [formData, setFormData] = useState<RecordItem>({
    id: '',
    label: '',
    status: '',
    block: '',
    zone: '',
    scheduleStartDate: '',
    wayleaveNumber: '',
    accountNumber: '',
    referenceNumber: '',
    requireUSP: false,
    sentToUSPDate: '',
    justification: '',
    createdAt: ''
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (record) {
      setFormData({ 
        ...record,
        sentToUSPDate: record.sentToUSPDate ? new Date(record.sentToUSPDate).toISOString().split('T')[0] : '',
        scheduleStartDate: record.scheduleStartDate ? new Date(record.scheduleStartDate).toISOString().split('T')[0] : '',
        justification: record.justification || ''
      });
      setError('');
    }
  }, [record]);

  const handleSave = async () => {
    if (!record) return;

    const needsJustification = formData.status === 'Suspended by EDD' || formData.status === 'Cancelled';

    if (needsJustification && !formData.justification?.trim()) {
      setError(`Justification is required when status is "${formData.status}".`);
      return;
    }

    setIsSaving(true);
    setError('');
    
    await onSave(record.id, {
      ...formData,
      sentToUSPDate: formData.sentToUSPDate ? new Date(formData.sentToUSPDate).toISOString() : undefined,
      scheduleStartDate: formData.scheduleStartDate ? new Date(formData.scheduleStartDate).toISOString() : new Date().toISOString()
    });
    
    setIsSaving(false);
    onClose();
  };

  const handleChange = (key: keyof RecordItem, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  if (!isOpen || !record) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col animate-scale-in border border-slate-200 dark:border-slate-800 max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white">Edit Record Details</h2>
            <p className="text-xs text-slate-500 mt-1">Ref: {formData.referenceNumber}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <Icons.Close className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Core Info */}
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Project Title / Label</label>
              <input 
                type="text" 
                value={formData.label}
                onChange={(e) => handleChange('label', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-medium"
              />
            </div>

            {/* Identifiers */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Reference Number</label>
              <input 
                type="text" 
                value={formData.referenceNumber}
                onChange={(e) => handleChange('referenceNumber', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
            </div>
             <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Account Number</label>
              <input 
                type="text" 
                value={formData.accountNumber}
                onChange={(e) => handleChange('accountNumber', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Block</label>
              <input 
                type="text" 
                value={formData.block}
                onChange={(e) => handleChange('block', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Zone</label>
              <input 
                type="text" 
                value={formData.zone}
                onChange={(e) => handleChange('zone', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
            </div>

            {/* Status & Dates */}
            <div className="md:col-span-2 border-t border-slate-100 dark:border-slate-800 my-2 pt-4">
               <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Current Status</label>
               <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all appearance-none cursor-pointer font-bold"
              >
                {STATUS_SEQUENCE.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
                {!STATUS_SEQUENCE.includes(formData.status) && formData.status && (
                  <option value={formData.status}>{formData.status}</option>
                )}
              </select>
            </div>

            {/* Conditional Justification */}
            {(formData.status === 'Suspended by EDD' || formData.status === 'Cancelled') && (
              <div className={`md:col-span-2 animate-fade-in-down p-4 rounded-xl border ${formData.status === 'Cancelled' ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/50'}`}>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${formData.status === 'Cancelled' ? 'text-slate-600 dark:text-slate-400' : 'text-red-600 dark:text-red-400'}`}>
                  <Icons.Alert className="w-4 h-4" /> Justification Required
                </label>
                <textarea 
                  value={formData.justification}
                  onChange={(e) => handleChange('justification', e.target.value)}
                  placeholder="Please provide the reason..."
                  rows={3}
                  className={`w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none transition-all resize-none border ${formData.status === 'Cancelled' ? 'border-slate-200 dark:border-slate-700 focus:border-slate-500 focus:ring-4 focus:ring-slate-500/10' : 'border-red-200 dark:border-red-900/50 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'}`}
                />
              </div>
            )}

            {/* Schedule & Wayleave */}
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Wayleave Number</label>
              <input 
                type="text" 
                value={formData.wayleaveNumber}
                onChange={(e) => handleChange('wayleaveNumber', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Schedule Start Date</label>
              <input 
                type="date" 
                value={formData.scheduleStartDate}
                onChange={(e) => handleChange('scheduleStartDate', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
              />
            </div>

            {/* USP Details */}
            <div className="md:col-span-2 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row gap-6 items-start md:items-center">
              <div className="flex items-center gap-3">
                <input 
                  type="checkbox" 
                  id="requireUSP"
                  checked={formData.requireUSP}
                  onChange={(e) => handleChange('requireUSP', e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="requireUSP" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">Require USP Approval?</label>
              </div>

              {formData.requireUSP && (
                <div className="flex-1 w-full animate-fade-in">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Sent to USP Date</label>
                  <input 
                    type="date" 
                    value={formData.sentToUSPDate}
                    onChange={(e) => handleChange('sentToUSPDate', e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none transition-all text-sm"
                  />
                </div>
              )}
            </div>
            
            {error && (
              <div className="md:col-span-2 text-red-600 text-sm font-medium flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30 animate-shake">
                <Icons.Alert className="w-5 h-5" /> {error}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 bg-slate-50/50 dark:bg-slate-900 rounded-b-2xl">
          <button 
            onClick={onClose}
            className="px-6 py-3 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors font-bold text-sm"
          >
            Discard
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-8 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-xl transition-all font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-900/10 dark:shadow-emerald-900/20 active:scale-95"
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
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors duration-300">
      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl shadow-slate-200/50 dark:shadow-black/20 w-full max-w-md border border-slate-100 dark:border-slate-800 animate-fade-in-up">
        <div className="text-center mb-10">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/20 animate-bounce-subtle">
            <Icons.Dashboard className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Welcome Back</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-3 font-medium">Sign in to your planning dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-medium"
              placeholder="admin@example.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider ml-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-medium"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300 text-sm rounded-xl flex items-center gap-3 border border-rose-100 dark:border-rose-900 animate-shake">
              <Icons.Alert className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all shadow-xl shadow-slate-900/10 dark:shadow-emerald-900/20 flex items-center justify-center gap-2 active:scale-95"
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
  notification: AppNotification;
  onClose: (id: string) => void;
  onClick?: (notification: AppNotification) => void;
}

const NotificationToast: React.FC<NotificationProps> = ({ notification, onClose, onClick }) => {
  const style = {
    [NotificationType.INFO]: 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200',
    [NotificationType.WARNING]: 'bg-white dark:bg-slate-800 border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-200',
    [NotificationType.SUCCESS]: 'bg-white dark:bg-slate-800 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-200',
    [NotificationType.ERROR]: 'bg-white dark:bg-slate-800 border-rose-100 dark:border-rose-900/50 text-rose-700 dark:text-rose-200',
  }[notification.type];

  return (
    <div 
      className={`fixed bottom-6 right-6 z-50 p-4 pr-10 rounded-2xl border shadow-2xl shadow-slate-200/50 dark:shadow-black/50 max-w-sm w-full animate-slide-in-right ${style} flex items-start gap-3 cursor-pointer hover:scale-[1.02] transition-transform duration-200`}
      onClick={() => onClick && onClick(notification)}
    >
      <div className="mt-0.5 p-1.5 rounded-full bg-current/10 shrink-0">
        {notification.type === NotificationType.WARNING && <Icons.Alert className="w-4 h-4" />}
        {notification.type === NotificationType.SUCCESS && <Icons.Check className="w-4 h-4" />}
        {notification.type === NotificationType.INFO && <Icons.Bell className="w-4 h-4" />}
        {notification.type === NotificationType.ERROR && <Icons.Alert className="w-4 h-4" />}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm leading-tight">{notification.message}</p>
        <p className="text-[10px] opacity-60 mt-1.5 font-medium uppercase tracking-wide">{new Date(notification.timestamp).toLocaleTimeString()}</p>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onClose(notification.id); }} 
        className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity p-1"
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
      className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${
        isDragging 
          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 scale-[1.02]' 
          : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:border-emerald-400 dark:hover:border-emerald-600'
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isProcessing ? (
        <div className="py-8 flex flex-col items-center">
          <Icons.Spinner className="w-10 h-10 text-emerald-500 animate-spin mb-4" />
          <p className="text-slate-900 dark:text-white font-semibold text-lg animate-pulse">Processing data...</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Parsing spreadsheet rows</p>
        </div>
      ) : (
        <>
          <div className="w-14 h-14 bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-slate-700 group-hover:scale-110 transition-transform duration-300">
            <Icons.Excel className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">Upload Spreadsheet</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-xs mx-auto leading-relaxed">Drag and drop your Excel file here, or click to browse your files</p>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            className="hidden" 
            id="file-upload"
            onChange={handleChange}
          />
          <label 
            htmlFor="file-upload" 
            className="cursor-pointer inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-sm font-bold shadow-xl shadow-slate-900/10 dark:shadow-white/5 transition-all hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
          >
            <Icons.Upload className="w-4 h-4" /> Select Excel File
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true); // Default collapsed
  const [statusFilter, setStatusFilter] = useState('Total'); // New Status Filter Tab State
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || 'light';
    }
    return 'light';
  });

  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);

  // Initialize Browser Notifications on mount (check status, don't request yet)
  useEffect(() => {
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) return;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        new window.Notification("Nexus Record Manager", {
          body: "Notifications enabled successfully!",
          silent: true
        });
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  };

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

  const addNotification = (notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: AppNotification = {
      ...notif,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);

    // Browser Notification Logic
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new window.Notification("Nexus Record Manager", {
          body: notif.message,
          // icon: '/vite.svg', // Ensure this exists or remove
          silent: false,
        });
      } catch (e) {
        console.error("Browser notification failed:", e);
      }
    }
  };

  const handleNotificationClick = (notification: AppNotification) => {
    if (notification.type === NotificationType.WARNING) {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
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

    // Helper to find index in sequence (case-insensitive)
    const getStatusIndex = (status: string) => {
      // Normalize comparison to be very forgiving
      return STATUS_SEQUENCE.findIndex(s => s.toLowerCase() === status.trim().toLowerCase());
    };

    for (const newRecord of newRecords) {
      // Improved matching: Case insensitive, trim
      const existingRecord = currentRecords.find(existing => {
        const existingRef = existing.referenceNumber?.trim().toLowerCase();
        const newRef = newRecord.referenceNumber?.trim().toLowerCase();
        const isRefMatch = existingRef && newRef && existingRef === newRef;
        
        const existingWayleave = existing.wayleaveNumber?.trim().toLowerCase();
        const newWayleave = newRecord.wayleaveNumber?.trim().toLowerCase();
        const isWayleaveMatch = existingWayleave && newWayleave && newWayleave !== '' && existingWayleave === newWayleave;
        
        return isRefMatch || isWayleaveMatch;
      });

      if (existingRecord) {
        const oldIndex = getStatusIndex(existingRecord.status);
        const newIndex = getStatusIndex(newRecord.status);

        // PRIORITY LOGIC:
        // Update if new status is HIGHER priority (later in sequence)
        // OR if old status was unknown (-1) and new one is known
        if (newIndex !== -1 && (oldIndex === -1 || newIndex > oldIndex)) {
            // Update fields. Merge new data into old.
            const updates: Partial<RecordItem> = {
                status: newRecord.status,
                label: newRecord.label || existingRecord.label,
                block: newRecord.block || existingRecord.block,
                zone: newRecord.zone || existingRecord.zone,
                scheduleStartDate: newRecord.scheduleStartDate || existingRecord.scheduleStartDate,
                // Only update wayleave/account if present in new
                wayleaveNumber: newRecord.wayleaveNumber || existingRecord.wayleaveNumber,
                accountNumber: newRecord.accountNumber || existingRecord.accountNumber,
                requireUSP: newRecord.requireUSP,
                sentToUSPDate: newRecord.sentToUSPDate || existingRecord.sentToUSPDate,
            };

            await updateRecord(existingRecord.id, updates);
            updatedCount++;
        } else {
            // Status is older or same -> Ignore
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
    if (updatedCount > 0) message += `Updated ${updatedCount}. `;
    if (ignoredCount > 0) message += `Ignored ${ignoredCount} (older status).`;
    
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

    // 1. Apply Status Filter (Tabs)
    if (statusFilter !== 'Total') {
        result = result.filter(r => r.status === statusFilter);
    }

    // 2. Search Filter
    if (search.trim()) {
       result = result.filter(r => 
        r.label.toLowerCase().includes(search.toLowerCase()) ||
        r.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.wayleaveNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.accountNumber.toLowerCase().includes(search.toLowerCase()) ||
        r.zone.toLowerCase().includes(search.toLowerCase())
      );
    }

    // 3. Sort
    result.sort((a, b) => {
      const aValue = a[sort.key];
      const bValue = b[sort.key];
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue < bValue) return sort.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sort.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [records, search, sort, statusFilter]);

  // Chart & Stats Data
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { 'Total': records.length };
    STATUS_SEQUENCE.forEach(s => counts[s] = 0);
    
    records.forEach(r => {
      // Find the matching status key case-insensitively
      const matchingKey = STATUS_SEQUENCE.find(s => s.toLowerCase() === r.status.toLowerCase());
      if (matchingKey) {
        counts[matchingKey]++;
      } else {
        // If unknown status, just track it under its own name if desired, or ignore.
        // For safety, we can add it to counts dynamicallly
        if (!counts[r.status]) counts[r.status] = 0;
        counts[r.status]++;
      }
    });
    return counts;
  }, [records]);

  // Chart Data (for graphs, excluding Total)
  const chartStatusData = useMemo(() => {
     return STATUS_SEQUENCE.map(step => ({
      name: step,
      value: statusCounts[step] || 0
    })).filter(item => item.value > 0);
  }, [statusCounts]);

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
    <div className="h-screen bg-slate-50 dark:bg-slate-950 flex font-sans overflow-hidden transition-colors duration-300 selection:bg-emerald-500/30 selection:text-emerald-900 dark:selection:text-emerald-200">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-30 lg:hidden backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Collapsible on Desktop) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-white dark:bg-slate-900 
        border-r border-slate-100 dark:border-slate-800
        transition-all duration-300 ease-in-out
        flex flex-col overflow-hidden h-full
        ${isMobileMenuOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full w-72'}
        lg:relative lg:translate-x-0
        ${isSidebarCollapsed ? 'lg:w-0 lg:border-none' : 'lg:w-72 lg:border-r'}
      `}>
        {/* Inner Content Wrapper with fixed width to prevent squashing */}
        <div className="w-72 flex flex-col h-full">
          <div className="p-8 flex items-center gap-4 text-slate-900 dark:text-white shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
              <Icons.Dashboard className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight whitespace-nowrap">Nexus</span>
            <button 
              onClick={() => setIsMobileMenuOpen(false)} 
              className="lg:hidden ml-auto text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <Icons.Close className="w-6 h-6" />
            </button>
          </div>

          <nav className="flex-1 px-6 space-y-2 py-4 overflow-y-auto">
            <p className="px-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4 whitespace-nowrap">Main Menu</p>
            <button 
              onClick={() => { setStatusFilter('Total'); setShowUpload(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium whitespace-nowrap ${statusFilter === 'Total' && !showUpload ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}
            >
              <Icons.Dashboard className={`w-5 h-5 flex-shrink-0 ${statusFilter === 'Total' && !showUpload ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span>Dashboard</span>
            </button>
            <button 
              onClick={() => setShowUpload(true)} 
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 font-medium whitespace-nowrap ${showUpload ? 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'}`}
            >
              <Icons.Excel className={`w-5 h-5 flex-shrink-0 ${showUpload ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span>Import Data</span>
            </button>
          </nav>

          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                <Icons.User className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-slate-900 dark:text-white font-semibold text-sm truncate">{auth.user?.username}</p>
                <p className="text-xs text-slate-500 capitalize">{auth.user?.role}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors py-2 text-sm font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg whitespace-nowrap">
              <Icons.Logout className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area (Flex Column) */}
      <main className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        
        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 flex flex-col">
          
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 shrink-0">
            <div className="flex items-center gap-4 w-full md:w-auto">
              {/* Mobile Sidebar Toggle */}
              <button 
                onClick={() => setIsMobileMenuOpen(true)}
                className="lg:hidden p-2.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
              >
                <Icons.Menu className="w-6 h-6" />
              </button>
              
              {/* Desktop Sidebar Toggle */}
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="hidden lg:flex p-2.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              >
                {isSidebarCollapsed ? <Icons.Right className="w-5 h-5" /> : <Icons.Menu className="w-5 h-5" />}
              </button>

              <div>
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white animate-fade-in tracking-tight">
                  Dashboard
                </h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1 animate-fade-in-up font-medium">
                  Overview of your planning operations
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button 
                onClick={toggleTheme}
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 dark:text-yellow-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <Icons.Sun className="w-5 h-5" /> : <Icons.Moon className="w-5 h-5" />}
              </button>

              <div className="relative flex-1 md:flex-none group">
                <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 group-focus-within:text-emerald-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search..." 
                  className="pl-11 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none w-full md:w-72 transition-all shadow-sm font-medium"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              
              <button 
                onClick={notificationPermission === 'granted' ? () => {} : requestNotificationPermission}
                className={`p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 relative transition-all shadow-sm group ${notificationPermission !== 'granted' ? 'animate-pulse' : 'text-slate-500 dark:text-slate-400'}`}
                title={notificationPermission === 'granted' ? 'Notifications Enabled' : 'Enable Notifications'}
              >
                <Icons.Bell className="w-5 h-5" />
                {notificationPermission !== 'granted' && notificationPermission !== 'denied' && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                )}
                {notifications.length > 0 && (
                  <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full animate-pulse ring-2 ring-white dark:ring-slate-900"></span>
                )}
              </button>
            </div>
          </header>

          {/* Status Filter Tabs (Wrapped, No Scroll) */}
          <div className="mb-8 shrink-0">
            <div className="flex flex-wrap gap-3">
              {STATUS_SEQUENCE.map((status) => {
                const count = statusCounts[status] || 0;
                const isActive = statusFilter === status;
                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`
                      flex items-center gap-3 px-5 py-3 rounded-xl border transition-all duration-200 group relative overflow-hidden
                      ${isActive 
                        ? 'bg-slate-900 dark:bg-emerald-600 border-slate-900 dark:border-emerald-500 text-white shadow-lg shadow-slate-900/20 dark:shadow-emerald-900/30 transform -translate-y-0.5' 
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-emerald-500/50 hover:shadow-md'
                      }
                    `}
                  >
                    <span className={`text-sm font-bold whitespace-nowrap ${isActive ? 'text-white' : 'group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                      {status}
                    </span>
                    <span className={`
                      text-xs font-bold px-2 py-0.5 rounded-md min-w-[24px] text-center
                      ${isActive 
                        ? 'bg-white/20 text-white' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                      }
                    `}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload Area (Conditional) */}
          {showUpload && (
            <div className="mb-10 animate-fade-in-down shrink-0">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg text-slate-800 dark:text-white">Import Records</h3>
                <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition-transform hover:rotate-90 p-2">
                  <Icons.Close className="w-5 h-5" />
                </button>
              </div>
              <ExcelUploader onUpload={handleExcelUpload} />
            </div>
          )}

          {/* Content Grid - Flex-1 to take remaining height */}
          <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
            
            {/* List Section (Expanded Width) - Takes remaining height */}
            <div className="lg:w-2/3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden animate-fade-in-up h-[600px] lg:h-auto lg:flex-1">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 shrink-0 z-10">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  {statusFilter === 'Total' ? 'All Records' : statusFilter}
                  <span className="text-slate-400 text-sm font-normal">({filteredRecords.length})</span>
                </h2>
                <div className="flex gap-2">
                  <select 
                      className="text-xs font-medium border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/20"
                      onChange={(e) => setSort({ key: e.target.value as keyof RecordItem, direction: 'desc' })}
                  >
                    <option value="createdAt">Newest First</option>
                    <option value="scheduleStartDate">Schedule Date</option>
                    <option value="status">Status</option>
                    <option value="zone">Zone</option>
                  </select>
                </div>
              </div>
              {/* Table Container - Flex-1 to scroll independently */}
              <div className="overflow-auto flex-1 custom-scrollbar relative">
                {isLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-4">
                    <Icons.Spinner className="animate-spin w-8 h-8 text-emerald-500" /> 
                    <span className="animate-pulse font-medium">Loading records...</span>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/80 dark:bg-slate-950/50 text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider sticky top-0 backdrop-blur-sm z-10 shadow-sm">
                      <tr>
                        <th className="px-6 py-4 w-16">#</th>
                        <th className="px-6 py-4">Reference</th>
                        <th className="px-6 py-4">Details</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">USP</th>
                        <th className="px-6 py-4">Scheduled</th>
                        <th className="px-6 py-4">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                      {filteredRecords.map((record, index) => (
                        <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                          <td className="px-6 py-4 text-xs font-medium text-slate-400 dark:text-slate-600">
                            {index + 1}
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md whitespace-nowrap">
                              {record.referenceNumber}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900 dark:text-white text-sm mb-0.5">{record.label}</div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Zone: {record.zone}</span>
                            </div>
                            {record.justification && (
                              <div className="mt-1 text-xs text-red-500 font-medium italic">
                                Note: {record.justification}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold capitalize shadow-sm tracking-wide ${getStatusColor(record.status)}`}>
                              {record.status === 'Suspended by EDD' && <span className="mr-1.5 relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                              </span>}
                              {record.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {record.requireUSP ? (
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Required</span>
                                {record.sentToUSPDate ? (
                                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 whitespace-nowrap">
                                    <Icons.Check className="w-3 h-3" /> Sent
                                  </span>
                                ) : (
                                  <span className="text-xs text-amber-600 dark:text-amber-500 font-medium flex items-center gap-1 whitespace-nowrap animate-pulse">
                                    <Icons.Clock className="w-3 h-3" /> Pending
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600 text-lg">&bull;</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-sm font-medium whitespace-nowrap">
                            {new Date(record.scheduleStartDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => setEditingRecord(record)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg transition-colors"
                                title="Edit Record"
                              >
                                <Icons.Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(record.id)}
                                className="p-2 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition-colors"
                                title="Delete Record"
                              >
                                <Icons.Trash className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredRecords.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-20 text-center">
                            <div className="flex flex-col items-center justify-center">
                              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <Icons.Search className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                              </div>
                              <p className="text-slate-500 dark:text-slate-400 font-medium">No records found matching your criteria.</p>
                              <button onClick={() => { setSearch(''); setStatusFilter('Total'); }} className="mt-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold hover:underline">
                                Clear Filters
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Analytics Section (Right Column) - Fixed width, scrolls if main container overflows (unlikely with flex-1 on left but possible) or stays fixed */}
            <div className="lg:w-1/3 flex flex-col gap-6 overflow-y-auto">
              
              {/* Total Records Card */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-3xl shadow-lg shadow-emerald-500/20 text-white flex flex-col animate-fade-in-up relative overflow-hidden group shrink-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div>
                    <p className="text-emerald-100 font-medium text-sm uppercase tracking-wide">Total Projects</p>
                    <h3 className="text-4xl font-bold mt-1">{statusCounts['Total']}</h3>
                  </div>
                  <div className="bg-white/20 p-2 rounded-xl">
                    <Icons.Dashboard className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="relative z-10 mt-auto">
                    <button 
                      onClick={() => setStatusFilter('Total')}
                      className="text-xs font-bold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 w-fit"
                    >
                      View All Records <Icons.Right className="w-3 h-3" />
                    </button>
                </div>
              </div>

              {/* Status Chart */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm h-80 flex flex-col animate-fade-in-up shrink-0">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-slate-900 dark:text-white">Status Distribution</h3>
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-1.5 rounded-lg">
                    <Icons.Dashboard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartStatusData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1e293b' : '#f1f5f9'} />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10}} 
                          angle={-45} 
                          textAnchor="end"
                          interval={0}
                          height={60}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 12}} />
                        <Tooltip 
                          cursor={{fill: theme === 'dark' ? '#1e293b' : '#f8fafc', opacity: 0.4}}
                          contentStyle={{
                            borderRadius: '12px', 
                            border: 'none', 
                            backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', 
                            color: theme === 'dark' ? '#f8fafc' : '#1e293b',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                          }}
                        />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {chartStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getChartColor(entry.name, theme)} />
                          ))}
                        </Bar>
                      </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Zone Chart */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm h-80 flex flex-col animate-fade-in-up shrink-0">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-slate-900 dark:text-white">Zone Activity</h3>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-1.5 rounded-lg">
                    <Icons.Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                </div>
                <div className="w-full h-64">
                  <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={zoneData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                          stroke="none"
                        >
                          {zoneData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6'][index % 4]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{
                            borderRadius: '12px', 
                            border: 'none', 
                            backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', 
                            color: theme === 'dark' ? '#f8fafc' : '#1e293b',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                          }}
                        />
                        <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '12px', fontWeight: 500}} />
                      </PieChart>
                  </ResponsiveContainer>
                </div>
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
    </div>
  );
};

export default App;