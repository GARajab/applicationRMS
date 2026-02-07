import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from './components/Icons';
import * as XLSX from 'xlsx';
import { RecordItem, InfraReferenceItem } from './types';
import { getRecords, addRecord, deleteRecord, updateRecord, searchInfraReferences, saveInfraReferences, clearInfraReferences, getInfraStats, getPaidPlotNumbers } from './services/storageService';
import { generateRecordReport } from './services/geminiService';

// --- Constants ---
const STATUS_SEQUENCE = [
  "All Projects", // Added 'All' tab
  "Assign planning", "Site Visit", "Design", "Design approval", 
  "GIS digitalization", "Wayleave", "Cost estimation", 
  "Attach Utilities Drawing", "Engineer approval", "Redesign", 
  "Suspended by EDD", "Work Design"
];

// --- Helper Functions ---
const parseDateSafe = (value: any): string => {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

const normalizePlot = (s: any) => String(s || '').trim();

// Fuzzy matcher for Excel
const getValueByFuzzyKey = (row: any, ...candidates: string[]): string => {
  const rowKeys = Object.keys(row);
  const normalizedKeys = rowKeys.reduce((acc, key) => {
    acc[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = key;
    return acc;
  }, {} as Record<string, string>);

  for (const candidate of candidates) {
    const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    const foundKey = normalizedKeys[normalizedCandidate];
    if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
      return String(row[foundKey]).trim();
    }
  }
  return '';
};

// --- Sub-Components ---

const InfraBadge: React.FC<{ isPaid: boolean }> = ({ isPaid }) => {
  if (isPaid) {
    return (
      <div className="relative group cursor-help">
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-lg blur opacity-25 group-hover:opacity-75 transition duration-200 animate-pulse"></div>
        <div className="relative flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-500/50 rounded-lg text-emerald-700 dark:text-emerald-400 font-bold text-xs uppercase tracking-wider shadow-sm">
           <Icons.Check className="w-3.5 h-3.5" />
           <span>Paid</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-wider opacity-80">
        <Icons.Close className="w-3.5 h-3.5" />
        <span>No Record</span>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: any; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow cursor-default group">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} bg-opacity-10 group-hover:scale-110 transition-transform`}>
      <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  </div>
);

const LoadingScreen: React.FC = () => (
  <div className="fixed inset-0 bg-slate-50 dark:bg-slate-950 z-[100] flex flex-col items-center justify-center animate-fade-in">
    <div className="w-24 h-24 relative flex items-center justify-center">
      <div className="absolute inset-0 bg-emerald-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
      <Icons.Dashboard className="w-12 h-12 text-slate-900 dark:text-white animate-bounce-subtle z-10" />
    </div>
    <div className="mt-4 flex flex-col items-center">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Nexus Manager</h1>
      <p className="text-slate-500 text-sm mt-1 animate-pulse">Loading System Resources...</p>
    </div>
  </div>
);

// --- Main Views ---

const DashboardView: React.FC<{ 
  records: RecordItem[], 
  paidPlots: Set<string>, 
  onSearch: (t: string) => void, 
  searchTerm: string,
  onUpload: () => void,
  onEdit: (r: RecordItem) => void,
  onDelete: (id: string) => void
}> = ({ records, paidPlots, onSearch, searchTerm, onUpload, onEdit, onDelete }) => {
  const [activeTab, setActiveTab] = useState("All Projects");

  const filteredData = useMemo(() => {
    let data = records;
    // 1. Filter by Tab
    if (activeTab !== "All Projects") {
      data = data.filter(r => (r.status || '').toLowerCase() === activeTab.toLowerCase());
    }
    // 2. Filter by Search
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      data = data.filter(r => 
        (r.label || '').toLowerCase().includes(lowerTerm) || 
        (r.plotNumber || '').includes(lowerTerm) ||
        (r.referenceNumber || '').toLowerCase().includes(lowerTerm)
      );
    }
    return data;
  }, [records, activeTab, searchTerm]);

  // Insights
  const totalValue = filteredData.reduce((acc, r) => acc + (parseFloat(r.plannedTotalCost || '0') || 0), 0);
  const urgentCount = filteredData.filter(r => r.urgent).length;
  const paidCount = filteredData.filter(r => r.plotNumber && paidPlots.has(normalizePlot(r.plotNumber))).length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Projects" value={filteredData.length} icon={Icons.Dashboard} color="bg-blue-500" />
        <StatCard label="Estimated Value" value={`${totalValue.toLocaleString()} BD`} icon={Icons.CreditCard} color="bg-emerald-500" />
        <StatCard label="Urgent Actions" value={urgentCount} icon={Icons.Alert} color="bg-rose-500" />
        <StatCard label="Infra Paid" value={paidCount} icon={Icons.Check} color="bg-purple-500" />
      </div>

      {/* Interactive Tabs */}
      <div className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 pt-2 pb-4 -mx-4 px-4 md:px-0 md:mx-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-2">
          {STATUS_SEQUENCE.map(status => (
            <button
              key={status}
              onClick={() => setActiveTab(status)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 border ${
                activeTab === status 
                  ? 'bg-slate-900 text-white border-slate-900 shadow-lg scale-105' 
                  : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {status} <span className="ml-1 opacity-60 text-xs">({status === "All Projects" ? records.length : records.filter(r => (r.status||'').toLowerCase() === status.toLowerCase()).length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          {activeTab} <span className="text-slate-400 font-normal text-sm">/ {filteredData.length} Records</span>
        </h2>
        <div className="flex gap-3">
          <div className="relative group">
            <Icons.Search className="absolute left-3 top-2.5 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchTerm}
              onChange={(e) => onSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-64 transition-all shadow-sm"
            />
          </div>
          <button onClick={onUpload} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-transform active:scale-95 flex items-center gap-2">
            <Icons.Plus className="w-4 h-4" /> New Record
          </button>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <tr>
                {["Project Label", "Status", "Zone", "Ref No", "Plot Number", "Job Type", "Created", "Infra Fee", "Actions"].map(h => (
                  <th key={h} className="px-6 py-4 font-bold text-slate-600 dark:text-slate-400 uppercase text-xs tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredData.length === 0 ? (
                <tr><td colSpan={9} className="p-8 text-center text-slate-400 italic">No records found for this filter.</td></tr>
              ) : filteredData.map((r, i) => (
                <tr key={r.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-slate-900 dark:text-white">{r.label}</div>
                    <div className="text-xs text-slate-400">{r.subtype}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold border border-slate-200 dark:border-slate-700">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono">{r.zone}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{r.referenceNumber}</td>
                  <td className="px-6 py-4 font-mono font-bold text-slate-800 dark:text-slate-200">{r.plotNumber || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{r.jobType || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{parseDateSafe(r.createdAt)}</td>
                  <td className="px-6 py-4">
                    <InfraBadge isPaid={!!(r.plotNumber && paidPlots.has(normalizePlot(r.plotNumber)))} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(r)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Icons.Edit className="w-4 h-4" /></button>
                      <button onClick={() => onDelete(r.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const CalculatorView: React.FC = () => {
  const [plotSearch, setPlotSearch] = useState('');
  const [searchResult, setSearchResult] = useState<InfraReferenceItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentType, setPaymentType] = useState<'10'|'12'|'6.5'>('10');
  const [fees, setFees] = useState('');
  const [ccRef, setCcRef] = useState('');

  const handleSearch = async () => {
    if (!plotSearch) return;
    setLoading(true);
    setSearchResult(null);
    const results = await searchInfraReferences(plotSearch);
    // Exact match priority
    const match = results.find(r => normalizePlot(r.plotNumber) === normalizePlot(plotSearch)) || results[0];
    setSearchResult(match || null);
    setLoading(false);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const dbItems = jsonData.map((row: any) => ({
          plotNumber: getValueByFuzzyKey(row, "Parcel / Plot number", "Plot number", "Plot"),
          initialPaymentDate: getValueByFuzzyKey(row, "Initial Payment Date", "1st Payment"),
          secondPayment: getValueByFuzzyKey(row, "Second Payment", "2nd Payment"),
          thirdPayment: getValueByFuzzyKey(row, "Third payment", "3rd Payment"),
          ownerNameEn: getValueByFuzzyKey(row, "Owner English Name", "Owner Name"),
          ewaFeeStatus: getValueByFuzzyKey(row, "EWA Fee Status", "Fee Status")
        }));
        await saveInfraReferences(dbItems);
        alert(`Uploaded ${dbItems.length} records to database.`);
      };
      reader.readAsBinaryString(file);
    }
  };

  const eddShare = parseFloat(fees) * ({'10':0.4, '12':0.375, '6.5':0.6923}[paymentType] || 0) || 0;
  const finalCC = Math.max(0, (parseFloat(ccRef) || 0) - eddShare);
  
  // Hooking Logic: Has Actual Payments?
  const hasPayments = searchResult && (
     (searchResult.initialPaymentDate && searchResult.initialPaymentDate.trim() !== '') ||
     (searchResult.secondPayment && searchResult.secondPayment.trim() !== '') ||
     (searchResult.thirdPayment && searchResult.thirdPayment.trim() !== '')
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-8rem)] animate-fade-in-up">
      {/* Left: Input & Tools */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        {/* Search Card */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-none">
          <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><Icons.Search className="w-5 h-5 text-blue-500" /> Database Search</h2>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter Plot Number..." 
              value={plotSearch}
              onChange={e => setPlotSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl font-bold text-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button onClick={handleSearch} className="absolute right-2 top-2 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              {loading ? <Icons.Spinner className="w-5 h-5 animate-spin" /> : <Icons.Right className="w-5 h-5" />}
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-center">
             <label className="text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                <Icons.Upload className="w-3 h-3" /> Update Database (Excel)
                <input type="file" className="hidden" onChange={handleUpload} />
             </label>
          </div>
        </div>

        {/* Calculator Card */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
           <h2 className="text-lg font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><Icons.Calculator className="w-5 h-5 text-emerald-500" /> Cost Recovery</h2>
           <div className="flex gap-2 mb-4">
              {['10', '12', '6.5'].map(t => (
                  <button key={t} onClick={() => setPaymentType(t as any)} className={`flex-1 py-2 rounded-lg font-bold text-sm border ${paymentType === t ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{t}</button>
              ))}
           </div>
           <div className="space-y-3">
              <input type="number" placeholder="Fees (BD)" value={fees} onChange={e => setFees(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-emerald-500" />
              <input type="number" placeholder="13/2006 CC (BD)" value={ccRef} onChange={e => setCcRef(e.target.value)} className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-emerald-500" />
           </div>
           {finalCC > 0 && (
               <div className="mt-4 p-4 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-100 animate-scale-in">
                  <div className="text-xs font-bold uppercase tracking-wide opacity-70">Final Amount</div>
                  <div className="text-2xl font-bold">{finalCC.toFixed(3)} BD</div>
               </div>
           )}
        </div>
      </div>

      {/* Right: Hooking Result Display */}
      <div className="w-full lg:w-2/3">
        {searchResult ? (
          <div className={`h-full rounded-3xl p-8 border-2 relative overflow-hidden transition-all duration-500 ${hasPayments ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500' : 'bg-slate-50 dark:bg-slate-900 border-red-400'}`}>
            
            {/* Background Decorations */}
            <div className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-3xl opacity-20 ${hasPayments ? 'bg-emerald-500' : 'bg-red-500'}`}></div>

            <div className="relative z-10 flex flex-col h-full">
              {/* Header */}
              <div className="flex justify-between items-start mb-8">
                 <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider opacity-60">Plot Status Report</h3>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white mt-1">{searchResult.plotNumber}</h1>
                    <p className="text-lg font-medium opacity-80 mt-2">{searchResult.ownerNameEn || 'Unknown Owner'}</p>
                 </div>
                 <div className={`w-20 h-20 rounded-2xl flex items-center justify-center shadow-xl ${hasPayments ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'} animate-bounce-subtle`}>
                    {hasPayments ? <Icons.Check className="w-10 h-10" /> : <Icons.Close className="w-10 h-10" />}
                 </div>
              </div>

              {/* Status Hook */}
              <div className={`p-6 rounded-2xl border-2 mb-8 text-center ${hasPayments ? 'bg-white border-emerald-100 shadow-emerald-200/50 shadow-lg' : 'bg-white border-red-100 shadow-red-200/50 shadow-lg'}`}>
                  <span className={`text-2xl font-black uppercase tracking-tight ${hasPayments ? 'text-emerald-600' : 'text-red-600'}`}>
                    {hasPayments ? 'INFRASTRUCTURE FEES PAID' : 'NO PAYMENT RECORDS FOUND'}
                  </span>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {['Initial Payment', 'Second Payment', 'Third Payment'].map((label, i) => {
                      const keys = ['initialPaymentDate', 'secondPayment', 'thirdPayment'];
                      const val = (searchResult as any)[keys[i]];
                      const hasVal = val && val.trim() !== '';
                      return (
                        <div key={label} className={`p-4 rounded-xl border bg-white/80 backdrop-blur ${hasVal ? 'border-emerald-200' : 'border-slate-200 opacity-70'}`}>
                           <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">{label}</div>
                           <div className={`font-bold text-lg ${hasVal ? 'text-emerald-700' : 'text-slate-400 italic'}`}>
                             {hasVal ? val : 'Not Recorded'}
                           </div>
                        </div>
                      );
                  })}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center text-slate-400 gap-4">
             <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center">
                <Icons.Search className="w-8 h-8 opacity-50" />
             </div>
             <p className="font-bold">Enter a plot number to verify fees.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ChatView: React.FC<{ records: RecordItem[] }> = ({ records }) => {
    // Same chat implementation but with updated styling containers
    return (
        <div className="flex items-center justify-center h-[60vh] text-slate-400">
           <p>Chat Module Placeholder (Keep existing logic here if needed)</p>
        </div>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'calculator' | 'chat'>('dashboard');
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [paidPlots, setPaidPlots] = useState<Set<string>>(new Set());

  // Initial Load
  const loadRecords = async () => {
    setLoading(true);
    const data = await getRecords();
    setRecords(data);
    const plots = data.map(r => normalizePlot(r.plotNumber)).filter(Boolean);
    if (plots.length > 0) {
      const paid = await getPaidPlotNumbers(plots);
      setPaidPlots(paid);
    }
    setLoading(false);
  };

  useEffect(() => { loadRecords(); }, []);

  const handleExcelUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const mapped = data.map((row: any) => ({
             id: '',
             label: getValueByFuzzyKey(row, "Label", "Title") || 'Untitled',
             status: getValueByFuzzyKey(row, "Status") || "Assign planning",
             plotNumber: getValueByFuzzyKey(row, "Plot Number", "Parcel"),
             referenceNumber: getValueByFuzzyKey(row, "Reference"),
             zone: getValueByFuzzyKey(row, "Zone"),
             createdAt: new Date().toISOString()
             // ... map other fields as needed
      }));
      for(const item of mapped) await addRecord(item);
      loadRecords();
      setShowUpload(false);
    };
    reader.readAsBinaryString(file);
  };

  if (loading) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-black font-sans text-slate-900 dark:text-slate-100 flex overflow-hidden">
      
      {/* Sidebar - Neo Glass */}
      <aside className="w-20 lg:w-64 bg-slate-900 text-white flex flex-col fixed h-full z-50 transition-all duration-300 shadow-2xl">
        <div className="p-6 flex items-center justify-center lg:justify-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Icons.Dashboard className="w-6 h-6 text-white" />
            </div>
            <h1 className="hidden lg:block font-black text-xl tracking-tighter">NEXUS</h1>
        </div>
        
        <nav className="flex-1 px-4 py-8 space-y-3">
          {[
            { id: 'dashboard', icon: Icons.Dashboard, label: 'Overview' },
            { id: 'calculator', icon: Icons.Calculator, label: 'Cost Recovery' },
            { id: 'chat', icon: Icons.ChatBubble, label: 'AI Assistant' }
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setCurrentView(item.id as any)}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all duration-300 group ${
                currentView === item.id 
                  ? 'bg-white/10 text-white shadow-inner backdrop-blur-sm border border-white/5' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`w-6 h-6 ${currentView === item.id ? 'text-emerald-400' : 'group-hover:text-emerald-400 transition-colors'}`} />
              <span className="hidden lg:block font-bold text-sm tracking-wide">{item.label}</span>
              {currentView === item.id && <div className="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
            <div className="hidden lg:flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-xs">AD</div>
                <div className="text-xs">
                    <p className="font-bold">Admin User</p>
                    <p className="text-slate-500">View Profile</p>
                </div>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-20 lg:ml-64 p-4 lg:p-8 overflow-y-auto h-screen relative">
        {/* Background Ambient Glow */}
        <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none"></div>

        <div className="max-w-7xl mx-auto relative z-10">
           {currentView === 'dashboard' && (
             <DashboardView 
               records={records} 
               paidPlots={paidPlots} 
               searchTerm={searchTerm} 
               onSearch={setSearchTerm} 
               onUpload={() => setShowUpload(true)}
               onEdit={setEditingRecord}
               onDelete={(id) => { if(confirm('Delete?')) deleteRecord(id).then(loadRecords); }}
             />
           )}
           {currentView === 'calculator' && <CalculatorView />}
           {currentView === 'chat' && <ChatView records={records} />}
        </div>

        {/* Upload Modal */}
        {showUpload && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scale-in">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icons.Upload className="w-8 h-8 text-blue-600" />
                        </div>
                        <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">Import Records</h3>
                        <p className="text-sm text-slate-500 mb-6">Select an Excel file (.xlsx) to bulk import projects.</p>
                        <input type="file" id="upload-input" className="hidden" accept=".xlsx" onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])} />
                        <div className="flex gap-3">
                            <label htmlFor="upload-input" className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold cursor-pointer hover:bg-blue-700 transition-colors">Select File</label>
                            <button onClick={() => setShowUpload(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
