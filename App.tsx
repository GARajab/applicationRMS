
import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from './components/Icons';
import * as XLSX from 'xlsx';
import { RecordItem, InfraReferenceItem } from './types';
import { getRecords, addRecord, deleteRecord, searchInfraReferences, saveInfraReferences, getPaidPlotNumbers } from './services/storageService';

// --- Constants ---
const STATUS_SEQUENCE = [
  "All Projects", 
  "Assign planning", "Site Visit", "Design", "Design approval", 
  "GIS digitalization", "Wayleave", "Cost estimation", 
  "Attach Utilities Drawing", "Engineer approval", "Redesign", 
  "Suspended by EDD", "Work Design"
];

const EWA_LOGO = "https://www.gdnonline.com/gdnimages/20230724/20230724111752EWALogo.png";

// --- Helper Functions ---
const parseDateSafe = (value: any): string => {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

const normalizePlot = (s: any) => String(s || '').trim();

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

// --- Styled Sub-Components ---

const InfraBadge: React.FC<{ isPaid: boolean }> = ({ isPaid }) => {
  if (isPaid) {
    return (
      <div className="relative group cursor-help flex items-center">
        <div className="absolute -inset-1 bg-emerald-500 rounded-full blur opacity-20 group-hover:opacity-40 transition animate-pulse"></div>
        <div className="relative flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-500 font-black text-[10px] uppercase tracking-tighter">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
           <span>Paid</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-full text-slate-400 font-bold text-[10px] uppercase tracking-tighter opacity-60">
        <span>No Record</span>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: any; color: string }> = ({ label, value, icon: Icon, color }) => (
  <div className="bg-white dark:bg-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm flex items-center gap-5 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} bg-opacity-10`}>
      <Icon className={`w-7 h-7 ${color.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-black text-slate-900 dark:text-white leading-none">{value}</p>
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
    if (activeTab !== "All Projects") {
      data = data.filter(r => (r.status || '').toLowerCase() === activeTab.toLowerCase());
    }
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

  const paidCount = records.filter(r => r.plotNumber && paidPlots.has(normalizePlot(r.plotNumber))).length;

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatCard label="Live Portfolio" value={records.length} icon={Icons.Dashboard} color="bg-indigo-500" />
        <StatCard label="Total Payments (Infra)" value={paidCount} icon={Icons.Check} color="bg-emerald-500" />
      </div>

      <div className="sticky top-0 z-20 -mx-8 px-8 py-4 bg-slate-50/80 dark:bg-black/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 overflow-x-auto no-scrollbar">
        <div className="flex gap-3">
          {STATUS_SEQUENCE.map(status => {
            const count = status === "All Projects" ? records.length : records.filter(r => (r.status||'').toLowerCase() === status.toLowerCase()).length;
            return (
              <button
                key={status}
                onClick={() => setActiveTab(status)}
                className={`whitespace-nowrap px-6 py-2.5 rounded-2xl text-xs font-black transition-all duration-300 border ${
                  activeTab === status 
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black border-transparent shadow-xl scale-105' 
                    : 'bg-white dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:border-slate-300'
                }`}
              >
                {status.toUpperCase()} <span className="ml-2 opacity-40 font-bold">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden">
        <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-100 dark:border-white/5">
            <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{activeTab}</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Found {filteredData.length} entries</p>
            </div>
            <div className="flex gap-4 w-full md:w-auto">
                <div className="relative flex-1 md:w-80">
                    <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="Search Label, Plot or Ref..." 
                      value={searchTerm}
                      onChange={(e) => onSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 bg-slate-100 dark:bg-white/5 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                </div>
                <button onClick={onUpload} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-black shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center gap-2">
                    <Icons.Plus className="w-4 h-4" /> IMPORT
                </button>
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 dark:bg-white/5">
              <tr>
                {["Project", "Stage", "Zone", "Reference", "Plot", "Infra Hook", ""].map(h => (
                  <th key={h} className="px-8 py-5 font-black text-slate-400 uppercase text-[10px] tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredData.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-slate-400 italic font-bold">No active projects found in this stage.</td></tr>
              ) : filteredData.map((r) => (
                <tr key={r.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-8 py-6">
                    <div className="font-black text-slate-900 dark:text-white text-base tracking-tight">{r.label}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase">{r.subtype || 'Project'}</div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="px-3 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-tighter border border-indigo-100 dark:border-indigo-500/20">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-slate-500 dark:text-slate-400 font-black">{r.zone}</td>
                  <td className="px-8 py-6 text-slate-400 font-mono text-xs">{r.referenceNumber}</td>
                  <td className="px-8 py-6 font-black text-slate-800 dark:text-slate-200">{r.plotNumber || '-'}</td>
                  <td className="px-8 py-6">
                    <InfraBadge isPaid={!!(r.plotNumber && paidPlots.has(normalizePlot(r.plotNumber)))} />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(r)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl"><Icons.Edit className="w-4 h-4" /></button>
                      <button onClick={() => onDelete(r.id)} className="p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl"><Icons.Trash className="w-4 h-4" /></button>
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
    const match = results.find(r => normalizePlot(r.plotNumber) === normalizePlot(plotSearch)) || results[0];
    setSearchResult(match || null);
    setLoading(false);
  };

  const hasPayments = searchResult && (
     (searchResult.initialPaymentDate && searchResult.initialPaymentDate.trim() !== '') ||
     (searchResult.secondPayment && searchResult.secondPayment.trim() !== '') ||
     (searchResult.thirdPayment && searchResult.thirdPayment.trim() !== '')
  );

  const eddShare = parseFloat(fees) * ({'10':0.4, '12':0.375, '6.5':0.6923}[paymentType] || 0) || 0;
  const finalCC = Math.max(0, (parseFloat(ccRef) || 0) - eddShare);

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[70vh] animate-fade-in-up">
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-xl">
          <h2 className="text-lg font-black mb-6 text-slate-900 dark:text-white flex items-center gap-3 uppercase tracking-tighter">
            <Icons.Search className="w-5 h-5 text-indigo-500" /> Database Search
          </h2>
          <div className="relative group">
            <input 
              type="text" 
              placeholder="PLOT NUMBER..." 
              value={plotSearch}
              onChange={e => setPlotSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-6 pr-14 py-4 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-2xl font-black text-xl outline-none focus:ring-4 focus:ring-indigo-500/20 transition-all"
            />
            <button onClick={handleSearch} className="absolute right-2 top-2 bottom-2 px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
              {loading ? <Icons.Spinner className="w-5 h-5 animate-spin" /> : <Icons.Right className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-xl">
           <h2 className="text-lg font-black mb-6 text-slate-900 dark:text-white flex items-center gap-3 uppercase tracking-tighter">
             <Icons.Calculator className="w-5 h-5 text-emerald-500" /> Cost Recovery
           </h2>
           <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-black rounded-xl">
              {['10', '12', '6.5'].map(t => (
                  <button key={t} onClick={() => setPaymentType(t as any)} className={`flex-1 py-2 rounded-lg font-black text-[10px] transition-all ${paymentType === t ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-400'}`}>{t} BD</button>
              ))}
           </div>
           <div className="space-y-4">
              <input type="number" placeholder="Fees (BD)" value={fees} onChange={e => setFees(e.target.value)} className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
              <input type="number" placeholder="13/2006 CC (BD)" value={ccRef} onChange={e => setCcRef(e.target.value)} className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black font-bold outline-none focus:ring-2 focus:ring-emerald-500" />
           </div>
           {finalCC > 0 && (
               <div className="mt-8 p-6 bg-emerald-500/10 text-emerald-500 rounded-3xl border border-emerald-500/20 animate-scale-in flex flex-col items-center">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-1 text-center">Final Adjusted Amount</div>
                  <div className="text-4xl font-black">{finalCC.toFixed(3)} BD</div>
               </div>
           )}
        </div>
      </div>

      <div className="w-full lg:w-2/3">
        {searchResult ? (
          <div className={`h-full rounded-[3rem] p-12 border-4 transition-all duration-700 relative overflow-hidden flex flex-col ${hasPayments ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 shadow-2xl shadow-emerald-500/10' : 'bg-slate-50 dark:bg-slate-900 border-rose-500 shadow-2xl shadow-rose-500/10'}`}>
            <div className={`absolute -right-32 -top-32 w-96 h-96 rounded-full blur-[100px] opacity-30 ${hasPayments ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                 <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.3em] opacity-40 mb-2">Internal Status Report</h3>
                    <h1 className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter leading-none">{searchResult.plotNumber}</h1>
                    <p className="text-2xl font-bold opacity-70 mt-4 tracking-tight">{searchResult.ownerNameEn || 'Private Entity'}</p>
                 </div>
                 <div className={`w-28 h-28 rounded-[2rem] flex flex-col items-center justify-center shadow-2xl animate-bounce-subtle ${hasPayments ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                    {hasPayments ? <Icons.Check className="w-12 h-12 mb-1" /> : <Icons.Close className="w-12 h-12 mb-1" />}
                    <span className="text-[10px] font-black">{hasPayments ? 'VERIFIED' : 'PENDING'}</span>
                 </div>
              </div>
              <div className={`p-10 rounded-[2.5rem] border-2 text-center mb-12 transform hover:scale-105 transition-all duration-500 ${hasPayments ? 'bg-white/80 dark:bg-black/40 border-emerald-100 dark:border-emerald-500/20 shadow-2xl shadow-emerald-200' : 'bg-white/80 dark:bg-black/40 border-rose-100 dark:border-rose-500/20 shadow-2xl shadow-rose-200'}`}>
                  <span className={`text-4xl font-black uppercase tracking-tighter ${hasPayments ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {hasPayments ? 'Infrastructure Fees Cleared' : 'Incomplete Payment Profile'}
                  </span>
                  <p className="text-slate-400 text-xs font-bold mt-2 uppercase tracking-widest">Database Sync ID: {searchResult.id.split('-')[0]}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {['First Installment', 'Second Installment', 'Final Settlement'].map((label, i) => {
                      const keys = ['initialPaymentDate', 'secondPayment', 'thirdPayment'];
                      const val = (searchResult as any)[keys[i]];
                      const isFound = val && val.trim() !== '';
                      return (
                        <div key={label} className={`p-6 rounded-3xl border bg-white/50 dark:bg-black/20 backdrop-blur-md transition-all ${isFound ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-slate-200 dark:border-white/5 opacity-50'}`}>
                           <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</div>
                           <div className={`font-black text-xl ${isFound ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-300 italic'}`}>
                             {isFound ? val : 'NOT RECORDED'}
                           </div>
                        </div>
                      );
                  })}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full rounded-[3rem] border-4 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 gap-6 p-12">
             <div className="w-32 h-32 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                <Icons.Search className="w-12 h-12 opacity-30" />
             </div>
             <div className="text-center">
                <p className="text-2xl font-black tracking-tight uppercase">Ready for validation</p>
                <p className="text-sm font-bold opacity-60">Enter a plot ID to hook into the financial database.</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'calculator'>('dashboard');
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [paidPlots, setPaidPlots] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    const data = await getRecords();
    setRecords(data);
    const plots = data.map(r => normalizePlot(r.plotNumber)).filter(Boolean);
    if (plots.length > 0) {
      setPaidPlots(await getPaidPlotNumbers(plots));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleExcelUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      
      // EXTREMELY SELECTIVE MAPPING: Only mapping core columns that are confirmed 
      // in the basic Supabase schema to avoid PGRST204 errors.
      const mapped: any[] = data.map((row: any) => ({
             label: getValueByFuzzyKey(row, "Label", "Title") || 'Untitled Project',
             status: getValueByFuzzyKey(row, "Status") || "Assign planning",
             plotNumber: normalizePlot(getValueByFuzzyKey(row, "Plot Number", "Parcel")),
             referenceNumber: getValueByFuzzyKey(row, "Reference", "Ref") || 'N/A',
             zone: getValueByFuzzyKey(row, "Zone") || '',
             block: getValueByFuzzyKey(row, "Block") || '',
             scheduleStartDate: parseDateSafe(getValueByFuzzyKey(row, "Schedule Start", "Start Date")) || new Date().toISOString(),
             wayleaveNumber: getValueByFuzzyKey(row, "Wayleave") || '',
             accountNumber: getValueByFuzzyKey(row, "Account") || '',
             requireUSP: false,
             createdAt: new Date().toISOString(),
             // Adding optional fields only if they have values to avoid column-not-found issues
             subtype: getValueByFuzzyKey(row, "Subtype") || undefined,
             jobType: getValueByFuzzyKey(row, "Job Type") || undefined
      }));
      
      let addedCount = 0;
      for(const item of mapped) {
          // addRecord now uses prunePayload internally to protect against schema mismatch
          const result = await addRecord(item as RecordItem);
          if (result) addedCount++;
      }
      loadData();
      setShowUpload(false);
      alert(`Imported ${addedCount} records successfully.`);
    };
    reader.readAsBinaryString(file);
  };

  if (loading) return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <Icons.Spinner className="w-12 h-12 text-indigo-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-400 font-black text-xs uppercase tracking-widest">Rajab A4/A5 Booting...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black font-sans text-slate-900 dark:text-slate-100 flex overflow-hidden">
      <aside className="w-24 lg:w-72 bg-slate-900/95 dark:bg-black/40 backdrop-blur-2xl text-white flex flex-col fixed h-full z-50 border-r border-white/5">
        <div className="p-10 flex flex-col items-center lg:items-start gap-4">
            <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-2xl overflow-hidden p-2">
                <img src={EWA_LOGO} alt="EWA Logo" className="w-full h-full object-contain" />
            </div>
            <div className="hidden lg:block">
                <h1 className="font-black text-xl tracking-tighter leading-none uppercase">Rajab A4/A5</h1>
                <p className="text-[10px] font-black text-indigo-400 tracking-[0.3em]">NEXUS SYSTEM</p>
            </div>
        </div>
        
        <nav className="flex-1 px-6 space-y-4">
          {[
            { id: 'dashboard', icon: Icons.Dashboard, label: 'Control Hub' },
            { id: 'calculator', icon: Icons.Calculator, label: 'Audit Engine' }
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setCurrentView(item.id as any)}
              className={`w-full flex items-center gap-5 px-6 py-4 rounded-2xl transition-all duration-500 group ${
                currentView === item.id 
                  ? 'bg-white/10 text-white border border-white/10 shadow-2xl' 
                  : 'text-slate-500 hover:text-white'
              }`}
            >
              <item.icon className={`w-6 h-6 transition-colors ${currentView === item.id ? 'text-indigo-400' : 'group-hover:text-indigo-400'}`} />
              <span className="hidden lg:block font-black text-xs uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-8">
            <div className="hidden lg:block p-6 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-center">
                <p className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] mb-2">Live Status</p>
                <div className="flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="font-bold text-xs">CONNECTED</span>
                </div>
            </div>
        </div>
      </aside>

      <main className="flex-1 ml-24 lg:ml-72 p-12 overflow-y-auto h-screen custom-scrollbar">
        <div className="max-w-7xl mx-auto">
           {currentView === 'dashboard' ? (
             <DashboardView 
               records={records} 
               paidPlots={paidPlots} 
               searchTerm={searchTerm} 
               onSearch={setSearchTerm} 
               onUpload={() => setShowUpload(true)}
               onEdit={() => {}}
               onDelete={(id) => { if(confirm('Delete?')) deleteRecord(id).then(loadData); }}
             />
           ) : <CalculatorView />}
        </div>

        {showUpload && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl animate-scale-in border border-white/10">
                    <div className="text-center">
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <Icons.Excel className="w-10 h-10 text-indigo-600" />
                        </div>
                        <h3 className="text-2xl font-black mb-2 text-slate-900 dark:text-white tracking-tighter uppercase">Seed Database</h3>
                        <p className="text-sm text-slate-500 mb-8 font-medium">Inject project records from your local Excel file.</p>
                        <input type="file" id="upload-input" className="hidden" accept=".xlsx" onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])} />
                        <div className="flex flex-col gap-3">
                            <label htmlFor="upload-input" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black cursor-pointer hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 uppercase text-xs tracking-widest">Select Dataset</label>
                            <button onClick={() => setShowUpload(false)} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-2xl font-black hover:bg-slate-200 transition-all uppercase text-xs tracking-widest">Dismiss</button>
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
