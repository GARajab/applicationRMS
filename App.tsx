import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from './components/Icons';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { RecordItem, User, AuthState, Notification as AppNotification, NotificationType, SortConfig } from './types';
import { getRecords, addRecord, deleteRecord, updateRecord, getInfraReferences, saveInfraReferences, clearInfraReferences } from './services/storageService';
import { generateDataInsights } from './services/geminiService';
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
  "Work Design"               // 12
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
const normalizeStatus = (s: string) => (s || '').trim().toLowerCase();

// Modern Color Mapping
const getStatusColor = (status: string) => {
  const s = normalizeStatus(status);
  
  // Emerald: Approvals & Final Stages
  if (['passed', 'engineer approval', 'work design', 'design approval'].includes(s)) {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
  }
  
  // Red: Issues / Suspensions
  if (s === 'suspended by edd' || s === 'cancelled') {
    return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 animate-pulse';
  }

  // Amber: GIS
  if (s.includes('gis')) {
    return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
  }
  
  // Rose: Wayleave
  if (s.includes('wayleave')) {
    return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
  }

  // Purple: Redesign
  if (s === 'redesign') {
    return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20';
  }

  // Blue: Early Stages
  if (['assign planning', 'site visit'].includes(s)) {
     return 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20';
  }

  // Cyan: Design & Drawings
  if (['design', 'attach utilities drawing'].includes(s)) {
     return 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20';
  }

  // Orange: Costing
  if (s === 'cost estimation') {
      return 'bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20';
  }
  
  // Default Slate
  return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
};

// Chart Color Mapping
const getChartColor = (status: string, theme: 'light' | 'dark') => {
  const s = normalizeStatus(status);
  
  if (['passed', 'engineer approval', 'work design', 'design approval'].includes(s)) return '#10b981'; // emerald
  if (s === 'suspended by edd') return '#ef4444'; // red
  if (s === 'cancelled') return theme === 'dark' ? '#475569' : '#94a3b8'; // slate
  if (s.includes('gis')) return '#f59e0b'; // amber
  if (s.includes('wayleave')) return '#f43f5e'; // rose
  if (s === 'redesign') return '#a855f7'; // purple
  if (['assign planning', 'site visit'].includes(s)) return '#3b82f6'; // blue
  if (['design', 'attach utilities drawing'].includes(s)) return '#06b6d4'; // cyan
  if (s === 'cost estimation') return '#f97316'; // orange

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

// Infra CC Calculator Modal
const InfraCalculatorModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [paymentType, setPaymentType] = useState<'10' | '12' | '6.5'>('10');
  const [fees, setFees] = useState('');
  const [ccRef, setCcRef] = useState(''); // 13/2006 CC

  // Lookup State
  const [referenceData, setReferenceData] = useState<any[]>([]);
  const [plotSearch, setPlotSearch] = useState('');
  const [fileName, setFileName] = useState('');
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);

  // Load existing references on mount
  useEffect(() => {
    if (isOpen) {
        loadReferences();
    }
  }, [isOpen]);

  const loadReferences = async () => {
      setIsLoadingReferences(true);
      const data = await getInfraReferences();
      // Flatten for search component compatibility
      // The local search logic expects a simple object per row.
      const flattened = data.map(item => ({ ...item.details, _dbId: item.id }));
      setReferenceData(flattened);
      if (data.length > 0) {
          setFileName('Database Loaded');
      }
      setIsLoadingReferences(false);
  };

  const eddShare = useMemo(() => {
    const val = parseFloat(fees);
    if (isNaN(val)) return 0;
    
    switch (paymentType) {
      case '10': return val * 0.4;
      case '12': return val * 0.375;
      case '6.5': return val * 0.6923076923076923;
      default: return 0;
    }
  }, [fees, paymentType]);

  const finalCC = useMemo(() => {
    const val = parseFloat(ccRef);
    if (isNaN(val)) return 0;
    
    if (val > eddShare) {
      return val - eddShare;
    }
    return 0;
  }, [ccRef, eddShare]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setIsLoadingReferences(true);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws);
        
        // Prepare for DB
        const dbItems = jsonData.map((row: any) => {
            const keys = Object.keys(row);
            const plotKey = keys.find(k => k.toLowerCase().includes('plot') || k.toLowerCase().includes('plot no') || k.toLowerCase().includes('parcel'));
            const plotNumber = plotKey ? String(row[plotKey]).trim() : 'Unknown';
            
            return {
                plotNumber,
                details: row
            };
        });

        // Save to DB
        await saveInfraReferences(dbItems);
        
        // Reload from DB to ensure sync
        await loadReferences();
    };
    reader.readAsBinaryString(file);
  };

  const handleClearDatabase = async () => {
      if (confirm("Are you sure you want to delete all saved infra reference data from the database?")) {
          setIsLoadingReferences(true);
          await clearInfraReferences();
          setReferenceData([]);
          setFileName('');
          setIsLoadingReferences(false);
      }
  };

  const searchResult = useMemo(() => {
    if (!plotSearch.trim() || referenceData.length === 0) return null;
    const term = plotSearch.trim().toLowerCase();
    
    // Priority: Look for a specific 'Plot' column first
    const firstRow = referenceData[0] || {};
    const keys = Object.keys(firstRow).filter(k => k !== '_dbId');
    const plotKey = keys.find(k => k.toLowerCase().includes('plot') || k.toLowerCase().includes('plot no') || k.toLowerCase().includes('parcel'));
    
    if (plotKey) {
        // Exact match first
        const exact = referenceData.find(row => String(row[plotKey]).trim().toLowerCase() === term);
        if (exact) return exact;
        // Then partial match
        return referenceData.find(row => String(row[plotKey]).trim().toLowerCase().includes(term));
    }
    
    // Fallback: Check all values for exact match then partial
    const exact = referenceData.find(row => Object.values(row).some(val => String(val).trim().toLowerCase() === term));
    if (exact) return exact;
    
    return referenceData.find(row => Object.values(row).some(val => String(val).trim().toLowerCase().includes(term)));
  }, [plotSearch, referenceData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col animate-scale-in border border-slate-200 dark:border-slate-800 max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900 rounded-t-2xl shrink-0">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Icons.Calculator className="w-6 h-6 text-emerald-500" />
            Infra CC Calculator
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
            <Icons.Close className="w-6 h-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-0">
            <div className="flex flex-col lg:flex-row h-full">
                {/* Left Side: Calculator */}
                <div className="p-6 lg:w-1/2 lg:border-r border-slate-100 dark:border-slate-800 space-y-6 overflow-y-auto">
                     {/* Payment Type */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Payment Type</label>
                        <div className="grid grid-cols-3 gap-3">
                        {['10', '12', '6.5'].map((type) => (
                            <button
                            key={type}
                            onClick={() => setPaymentType(type as any)}
                            className={`py-3 px-4 rounded-xl font-bold text-sm transition-all border ${
                                paymentType === type
                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20 transform scale-[1.02]'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-500/50 hover:bg-slate-50 dark:hover:bg-slate-700'
                            }`}
                            >
                            {type}
                            </button>
                        ))}
                        </div>
                    </div>

                    {/* Fees */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Fees Amount (BD)</label>
                        <div className="relative">
                        <input
                            type="number"
                            value={fees}
                            onChange={(e) => setFees(e.target.value)}
                            placeholder="Enter fees..."
                            className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-medium text-lg"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">BD</span>
                        </div>
                    </div>

                    {/* EDD Share Result */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/50">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">EDD Share (Calculated)</label>
                        <div className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-200">
                        {eddShare.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} <span className="text-sm text-slate-500">BD</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide font-medium">
                        Logic: Fees × {paymentType === '10' ? '0.400' : paymentType === '12' ? '0.375' : '0.6923...'}
                        </p>
                    </div>

                    {/* 13/2006 CC */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">13/2006 CC Amount (BD)</label>
                        <div className="relative">
                        <input
                            type="number"
                            value={ccRef}
                            onChange={(e) => setCcRef(e.target.value)}
                            placeholder="Enter 13/2006 CC..."
                            className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all font-medium text-lg"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">BD</span>
                        </div>
                    </div>

                    {/* Final CC */}
                    <div className={`p-5 rounded-2xl border transition-all duration-300 ${finalCC > 0 ? 'bg-emerald-50/80 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/50' : 'bg-slate-100/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/50'}`}>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <Icons.Check className={`w-4 h-4 ${finalCC > 0 ? 'text-emerald-500' : 'text-slate-400'}`} /> Final Cost Recovery (CC)
                        </label>
                        <div className={`text-4xl font-bold font-mono tracking-tight mt-1 ${finalCC > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                        {finalCC.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} <span className="text-lg opacity-60">BD</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                        {ccRef && parseFloat(ccRef) <= eddShare ? 'Result: Zero (13/2006 CC ≤ EDD Share)' : 'Result: 13/2006 CC - EDD Share'}
                        </p>
                    </div>
                </div>

                {/* Right Side: Lookup */}
                <div className="p-6 lg:w-1/2 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col h-full overflow-hidden">
                    <div className="mb-6">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-3 flex items-center justify-between">
                            Reference Data Lookup
                             {referenceData.length > 0 && (
                                <button 
                                    onClick={handleClearDatabase}
                                    className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1"
                                    title="Delete all saved data"
                                >
                                    <Icons.Trash className="w-3 h-3" /> Clear Database
                                </button>
                            )}
                        </h3>
                        
                        {isLoadingReferences ? (
                            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-white dark:bg-slate-900">
                                <Icons.Spinner className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Syncing Database...</p>
                            </div>
                        ) : !referenceData.length ? (
                             <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors bg-white dark:bg-slate-900">
                                <Icons.Upload className="w-8 h-8 text-slate-400 mb-3" />
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Upload Excel Sheet</p>
                                <p className="text-xs text-slate-400 mb-4">Import plot data to database</p>
                                <input 
                                    type="file" 
                                    accept=".xlsx, .xls" 
                                    id="ref-upload"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                                <label 
                                    htmlFor="ref-upload"
                                    className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-bold cursor-pointer hover:opacity-90 transition-opacity"
                                >
                                    Select File
                                </label>
                             </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
                                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                                        <Icons.Excel className="w-3 h-3" /> 
                                        {fileName || `${referenceData.length} records loaded`}
                                    </span>
                                    <button 
                                        onClick={() => { /* Only clear local view if needed, but for now user might want to keep it */ }}
                                        className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300 p-1 opacity-0 pointer-events-none"
                                    >
                                        <Icons.Close className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="relative">
                                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                    <input 
                                        type="text" 
                                        placeholder="Search by Plot Number..." 
                                        value={plotSearch}
                                        onChange={(e) => setPlotSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm font-medium"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-inner min-h-[200px]">
                        {searchResult ? (
                            <div className="space-y-3">
                                {Object.entries(searchResult).map(([key, value]) => {
                                    if (key === '_dbId') return null; // Skip internal ID
                                    return (
                                        <div key={key} className="flex flex-col border-b border-slate-50 dark:border-slate-800 pb-2 last:border-0 last:pb-0">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-0.5">{key}</span>
                                            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 break-words">{String(value)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-4 opacity-60">
                                <Icons.Search className="w-8 h-8 mb-2" />
                                <p className="text-xs font-medium">
                                    {referenceData.length === 0 ? "Upload a file to start searching" : "Enter a plot number to see details"}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
        
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-900 rounded-b-2xl shrink-0">
           <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl transition-all font-bold text-sm shadow-lg shadow-slate-900/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

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
    createdAt: '',
    initialPaymentDate: '',
    secondPayment: '',
    thirdPayment: ''
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (record) {
      setFormData({ 
        ...record,
        sentToUSPDate: record.sentToUSPDate ? new Date(record.sentToUSPDate).toISOString().split('T')[0] : '',
        scheduleStartDate: record.scheduleStartDate ? new Date(record.scheduleStartDate).toISOString().split('T')[0] : '',
        initialPaymentDate: record.initialPaymentDate ? new Date(record.initialPaymentDate).toISOString().split('T')[0] : '',
        justification: record.justification || ''
      });
      setError('');
    }
  }, [record]);

  const handleSave = async () => {
    if (!record) return;

    const needsJustification = formData.status === 'Suspended by EDD';

    if (needsJustification && !formData.justification?.trim()) {
      setError(`Justification is required when status is "${formData.status}".`);
      return;
    }

    setIsSaving(true);
    setError('');
    
    await onSave(record.id, {
      ...formData,
      sentToUSPDate: formData.sentToUSPDate ? new Date(formData.sentToUSPDate).toISOString() : undefined,
      scheduleStartDate: formData.scheduleStartDate ? new Date(formData.scheduleStartDate).toISOString() : new Date().toISOString(),
      initialPaymentDate: formData.initialPaymentDate ? new Date(formData.initialPaymentDate).toISOString() : undefined
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

            {/* Payment Information */}
            <div className="md:col-span-2 border-t border-slate-100 dark:border-slate-800 my-2 pt-4">
               <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                 <Icons.CreditCard className="w-4 h-4 text-emerald-500" /> Payment Information
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                   <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Initial Payment Date</label>
                   <input 
                      type="date" 
                      value={formData.initialPaymentDate}
                      onChange={(e) => handleChange('initialPaymentDate', e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                    />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Second Payment</label>
                   <input 
                      type="text" 
                      value={formData.secondPayment}
                      onChange={(e) => handleChange('secondPayment', e.target.value)}
                      placeholder="Amount/Ref"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                    />
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Third Payment</label>
                   <input 
                      type="text" 
                      value={formData.thirdPayment}
                      onChange={(e) => handleChange('thirdPayment', e.target.value)}
                      placeholder="Amount/Ref"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all"
                    />
                 </div>
               </div>
            </div>

            {/* Conditional Justification */}
            {(formData.status === 'Suspended by EDD') && (
              <div className="md:col-span-2 animate-fade-in-down p-4 rounded-xl border bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/50">
                <label className="block text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Icons.Alert className="w-4 h-4" /> Justification Required
                </label>
                <textarea 
                  value={formData.justification}
                  onChange={(e) => handleChange('justification', e.target.value)}
                  placeholder="Please provide the reason..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none transition-all resize-none border border-red-200 dark:border-red-900/50 focus:border-red-500 focus:ring-4 focus:ring-red-500/10"
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
            .map((row: any, index) => {
              // Status Logic - Normalize and Validate
              let rawStatus = String(row['Status'] || row['status'] || row['Application status'] || '').trim();
              
              // Find matching status from the allowed sequence (case-insensitive)
              // If not found, use the raw status or default to "Unknown" but don't strictly filter yet 
              // as this might be a raw import of data that doesn't track status in the same way.
              // However, the previous logic STRICTLY filtered. Let's try to map 'Application status' to internal status.
              const canonicalStatus = STATUS_SEQUENCE.find(s => s.toLowerCase() === rawStatus.toLowerCase());

              // If strictly adhering to previous logic, we skip if status doesn't match.
              // But with new headers, user might upload data with "Application status" which might not match exact internal workflow steps.
              // For now, let's keep strict logic but allow 'Application status' column to drive it.
              
              if (!canonicalStatus) {
                // Optional: Allow non-matching statuses if importing bulk raw data? 
                // Stick to requested behavior: "import excel sheet... get all info". 
                // If I filter out non-matching statuses, I might lose data.
                // Let's assume strict filtering is desired for the MAIN workflow, but maybe we should default to the first status if unknown?
                // Reverting to previous strict behavior to avoid breaking existing workflow unless user specified otherwise.
                return null;
              }

              const requireUSPRaw = String(row['Require USP'] || row['require_usp'] || '').toLowerCase();
              const requireUSP = requireUSPRaw === 'yes' || requireUSPRaw === 'true';

              // Sanitize inputs
              const wayleave = String(row['Wayleave number'] || row['Wayleave'] || '').trim();
              const account = String(row['Account Number'] || row['Account number'] || row['Account'] || '').trim();
              const ref = String(row['Reference Number'] || row['Reference'] || '').trim();
              const block = String(row['Block'] || row['Block number'] || '').trim();
              
              return {
                id: '', // Placeholder
                label: row['Label'] || row['Title'] || `Imported ${index + 1}`,
                status: canonicalStatus,
                block: block || 'N/A',
                zone: row['Zone'] || 'N/A',
                scheduleStartDate: parseDateSafe(row['Schedule start date'] || row['Start Date'] || row['Date']),
                wayleaveNumber: wayleave,
                accountNumber: account,
                referenceNumber: ref || `REF-${Date.now()}-${index}`,
                requireUSP: requireUSP,
                sentToUSPDate: parseExcelDate(row['Sent to USP Date']),
                createdAt: new Date().toISOString(),

                // Map New Fields
                applicationNumber: String(row['Application number'] || ''),
                bpRequestNumber: String(row['BP request number'] || ''),
                versionNumber: String(row['Version Number'] || ''),
                constructionType: String(row['Construction Type'] || ''),
                ewaFeeStatus: String(row['EWA Fee Status (Y or N)'] || ''),
                applicationStatus: String(row['Application status'] || ''),
                landOwnerId: String(row['Land Owner ID'] || ''),
                ownerNameEn: String(row['Owner English Name'] || ''),
                ownerNameAr: String(row['Owner Arabic Name'] || ''),
                numberOfAddresses: String(row['No of address required for this project'] || ''),
                mouGatedCommunity: String(row['MOU B/W EWA & gated community'] || ''),
                buildingNumber: String(row['Building number'] || ''),
                roadNumber: String(row['Road Number'] || ''),
                plotNumber: String(row['Parcel / Plot number'] || row['Plot number'] || ''),
                titleDeed: String(row['Title Deed'] || ''),
                buildableArea: String(row['Buildable Area'] || ''),
                momaaLoad: String(row['Momaa Electricity Load'] || ''),
                applicationDate: parseExcelDate(row['Date']) || new Date().toISOString(),
                nationality: String(row['Nationality'] || ''),
                propertyCategory: String(row['Prop Category'] || ''),
                usageNature: String(row['Usage Nature'] || ''),
                investmentZone: String(row['Investment Zone'] || ''),
                initialPaymentDate: parseExcelDate(row['Initial Payment Date']),
                secondPayment: String(row['Second Payment'] || ''),
                thirdPayment: String(row['Third payment'] || ''),
                errorLog: String(row['Error log'] || ''),
                partialExemption: String(row['Partial Exemption'] || '')
              } as RecordItem;
            })
            .filter((item): item is RecordItem => item !== null); // Remove nulls
          
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

const App: React.FC = () => {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [darkMode, setDarkMode] = useState(false); // Default light
  const [showUpload, setShowUpload] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [aiInsight, setAiInsight] = useState('');
  const [generatingInsight, setGeneratingInsight] = useState(false);

  // Initial Load
  useEffect(() => {
    loadRecords();
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    }
  }, []);

  // Toggle Dark Mode class on html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadRecords = async () => {
    setLoading(true);
    const data = await getRecords();
    setRecords(data);
    setLoading(false);
  };

  const handleExcelUpload = async (data: any[]) => {
    setLoading(true);
    let addedCount = 0;
    for (const item of data) {
       const saved = await addRecord(item);
       if (saved) addedCount++;
    }
    await loadRecords();
    setShowUpload(false);
    alert(`Successfully imported ${addedCount} records.`);
  };

  const handleSaveRecord = async (id: string, updates: Partial<RecordItem>) => {
    const success = await updateRecord(id, updates);
    if (success) {
      await loadRecords();
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (confirm('Are you sure you want to delete this record?')) {
      const success = await deleteRecord(id);
      if (success) {
        setRecords(prev => prev.filter(r => r.id !== id));
      }
    }
  };

  const handleGenerateInsights = async () => {
    setGeneratingInsight(true);
    const insight = await generateDataInsights(records);
    setAiInsight(insight);
    setGeneratingInsight(false);
  };

  // Derived State
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchesSearch = 
        r.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.referenceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.plotNumber?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [records, searchTerm, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    return {
        total: records.length,
        completed: records.filter(r => ['passed', 'work design'].includes(normalizeStatus(r.status))).length,
        pending: records.filter(r => !['passed', 'work design', 'cancelled', 'suspended by edd'].includes(normalizeStatus(r.status))).length,
        suspended: records.filter(r => normalizeStatus(r.status) === 'suspended by edd').length
    }
  }, [records]);
  
  // Charts Data
  const statusData = useMemo(() => {
    const counts: {[key: string]: number} = {};
    records.forEach(r => {
        const s = r.status || 'Unknown';
        counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [records]);

  if (loading && records.length === 0) return <LoadingScreen />;

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 font-sans text-slate-900 dark:text-slate-100 flex`}>
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col fixed h-full z-20">
         <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                <Icons.Dashboard className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">PlanManager</h1>
         </div>

         <nav className="flex-1 px-4 py-6 space-y-2">
            <a href="#" className="flex items-center gap-3 px-4 py-3 bg-white/10 text-emerald-400 rounded-xl font-medium transition-colors">
                <Icons.Dashboard className="w-5 h-5" /> Dashboard
            </a>
            <button onClick={() => setShowUpload(true)} className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl font-medium transition-colors">
                <Icons.Upload className="w-5 h-5" /> Import Data
            </button>
            <button onClick={() => setShowCalculator(true)} className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-xl font-medium transition-colors">
                <Icons.Calculator className="w-5 h-5" /> Infra CC Calc
            </button>
         </nav>

         <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                    AD
                </div>
                <div>
                    <p className="text-sm font-bold">Admin User</p>
                    <p className="text-xs text-slate-400">admin@system.com</p>
                </div>
            </div>
         </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-4 md:p-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Project Overview</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Welcome back, here's what's happening today.</p>
            </div>
            <div className="flex items-center gap-3">
                 <button 
                    onClick={() => setDarkMode(!darkMode)}
                    className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-emerald-500 transition-colors"
                >
                    {darkMode ? <Icons.Sun className="w-5 h-5" /> : <Icons.Moon className="w-5 h-5" />}
                </button>
                <button 
                    onClick={handleGenerateInsights}
                    disabled={generatingInsight}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all active:scale-95"
                >
                    {generatingInsight ? <Icons.Spinner className="w-4 h-4 animate-spin" /> : <Icons.AI className="w-4 h-4" />}
                    AI Insights
                </button>
            </div>
        </header>

        {/* AI Insight Box */}
        {aiInsight && (
             <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl relative overflow-hidden animate-fade-in">
                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold flex items-center gap-2"><Icons.AI className="w-5 h-5" /> Gemini Analysis</h3>
                        <button onClick={() => setAiInsight('')} className="p-1 hover:bg-white/20 rounded-lg"><Icons.Close className="w-4 h-4" /></button>
                    </div>
                    <p className="text-white/90 leading-relaxed whitespace-pre-wrap text-sm">{aiInsight}</p>
                </div>
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
             </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Icons.Dashboard className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Total Projects</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.total}</p>
                </div>
            </div>
             <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
                    <Icons.Clock className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Pending</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.pending}</p>
                </div>
            </div>
             <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <Icons.Check className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Completed</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.completed}</p>
                </div>
            </div>
             <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 dark:text-red-400">
                    <Icons.Alert className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">Suspended</p>
                    <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.suspended}</p>
                </div>
            </div>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
            <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                    <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                        type="text" 
                        placeholder="Search projects..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 outline-none text-sm"
                    />
                </div>
                <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none text-sm cursor-pointer"
                >
                    <option value="All">All Statuses</option>
                    {STATUS_SEQUENCE.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
            <div className="flex items-center gap-2">
                 <button 
                    onClick={() => setShowCalculator(true)}
                    className="md:hidden p-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700"
                >
                    <Icons.Calculator className="w-5 h-5" />
                </button>
                <button 
                    onClick={() => setShowUpload(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity"
                >
                    <Icons.Plus className="w-4 h-4" /> 
                    <span className="hidden sm:inline">Add / Import</span>
                </button>
            </div>
        </div>

        {/* Upload Area (Conditional) */}
        {showUpload && (
            <div className="mb-8 animate-fade-in-down">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="font-bold text-slate-800 dark:text-white">Import Data</h3>
                    <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-600"><Icons.Close className="w-5 h-5"/></button>
                </div>
                <ExcelUploader onUpload={handleExcelUpload} />
            </div>
        )}

        {/* Data Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Project / Label</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Reference</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Block / Zone</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                            <th className="p-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredRecords.length > 0 ? filteredRecords.map((record) => (
                            <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                <td className="p-4">
                                    <div className="font-bold text-slate-800 dark:text-slate-200">{record.label}</div>
                                    <div className="text-xs text-slate-400">{record.plotNumber ? `Plot: ${record.plotNumber}` : 'No Plot Info'}</div>
                                    {/* Infra Fees Applicable Indicator */}
                                    {(record.initialPaymentDate || record.secondPayment || record.thirdPayment) && (
                                        <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full w-fit">
                                            <Icons.CreditCard className="w-3 h-3" />
                                            <span>Infra Fees Applicable</span>
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 text-sm text-slate-600 dark:text-slate-300 font-mono">
                                    {record.referenceNumber || '-'}
                                </td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold capitalize ${getStatusColor(record.status)}`}>
                                        {record.status}
                                    </span>
                                </td>
                                <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                                    {record.block} <span className="text-slate-300 mx-1">/</span> {record.zone}
                                </td>
                                <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                                    {new Date(record.scheduleStartDate).toLocaleDateString()}
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => setEditingRecord(record)}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-500 transition-colors"
                                        >
                                            <Icons.Edit className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteRecord(record.id)}
                                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <Icons.Trash className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} className="p-12 text-center">
                                    <div className="flex flex-col items-center justify-center text-slate-400">
                                        <Icons.Search className="w-12 h-12 mb-3 opacity-20" />
                                        <p className="font-medium">No records found</p>
                                        <p className="text-sm">Try adjusting your search or filters</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </main>

      {/* Modals */}
      <EditRecordModal 
        isOpen={!!editingRecord} 
        record={editingRecord} 
        onClose={() => setEditingRecord(null)} 
        onSave={handleSaveRecord}
      />
      
      <InfraCalculatorModal 
        isOpen={showCalculator} 
        onClose={() => setShowCalculator(false)} 
      />
    </div>
  );
};

export default App;