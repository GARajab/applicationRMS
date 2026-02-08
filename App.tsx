
import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from './components/Icons';
import * as XLSX from 'xlsx';
import { RecordItem, InfraReferenceItem } from './types';
import { getRecords, addRecord, updateRecord, deleteRecord, searchInfraReferences, getInfraHookData, saveInfraReferences, getExistingInfraPlots } from './services/storageService';

// --- Constants ---

const STATUS_OPTIONS = ["In Design", "GIS", "WL / GSN", "USP", "Passed"];
const STATUS_SEQUENCE = ["All Projects", ...STATUS_OPTIONS];

const VALID_IMPORT_STATUSES = [
  "Assign planning", "Site Visit", "Design", "Design approval", 
  "GIS digitalization", "Wayleave", "Cost estimation", 
  "Attach Utilities Drawing", "Engineer approval", "1Redesign", 
  "Suspended by EDD", "Work Design"
];

const EWA_LOGO = "https://www.gdnonline.com/gdnimages/20230724/20230724111752EWALogo.png";

// --- Helper Functions ---

const mapSourceToUIStatus = (sourceStatus: string): string => {
  const s = sourceStatus.trim().toLowerCase();
  const inDesign = ["assign planning", "site visit", "design", "design approval", "engineer approval", "1redesign"];
  const gis = ["gis digitalization"];
  const wl = ["wayleave"];
  const usp = ["suspended by edd", "cost estimation", "attach utilities drawing"];
  const passed = ["work design"];

  if (inDesign.includes(s)) return "In Design";
  if (gis.includes(s)) return "GIS";
  if (wl.includes(s)) return "WL / GSN";
  if (usp.includes(s)) return "USP";
  if (passed.includes(s)) return "Passed";
  
  return "In Design";
};

const parseDateSafe = (value: any): string => {
  if (!value) return '';
  // Handle Excel date serial numbers if necessary
  if (typeof value === 'number') {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
};

const normalizePlot = (s: any) => String(s || '').trim().toUpperCase();

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

const FeedbackMessage: React.FC<{ message: string, type: 'success' | 'error', onClose: () => void }> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 animate-fade-in-up font-normal ${
      type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : 'bg-rose-500 border-rose-400 text-white'
    }`}>
      {type === 'success' ? <Icons.Check className="w-5 h-5" /> : <Icons.Alert className="w-5 h-5" />}
      <span className="text-sm font-normal">{message}</span>
    </div>
  );
};

const InfraHookBadge: React.FC<{ plot: string, hookData: Record<string, { appNo: string, isPaid: boolean }> }> = ({ plot, hookData }) => {
  const normalized = normalizePlot(plot);
  const data = hookData[normalized];

  if (data && data.isPaid) {
    return (
      <div className="relative group cursor-help flex items-center">
        <div className="absolute -inset-1 bg-emerald-500 rounded-lg blur opacity-10 group-hover:opacity-20 transition"></div>
        <div className="relative flex flex-col items-start px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
           <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span className="text-emerald-600 dark:text-emerald-400 font-normal text-[10px] uppercase tracking-wide">YES</span>
           </div>
           <span className="text-[9px] font-normal text-slate-400 uppercase leading-none mt-0.5">{data.appNo}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/10 rounded-xl opacity-80">
        <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
        <span className="text-rose-500 font-normal text-[10px] uppercase tracking-wide">NO</span>
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string | number; icon: any; color: string; onClick?: () => void }> = ({ label, value, icon: Icon, color, onClick }) => (
  <button 
    onClick={onClick}
    disabled={!onClick}
    className={`bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm flex items-center gap-5 hover:shadow-md transition-all duration-300 w-full text-left ${onClick ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5' : 'cursor-default'}`}
  >
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${color} bg-opacity-10`}>
      <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
    </div>
    <div className="flex-1">
      <p className="text-slate-400 text-xs font-normal uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-normal text-slate-900 dark:text-white leading-none">{value}</p>
    </div>
    {onClick && <Icons.Right className="w-4 h-4 text-slate-300" />}
  </button>
);

// --- Modals ---

const DelayedAlertModal: React.FC<{ delayedRecords: RecordItem[], onClose: () => void }> = ({ delayedRecords, onClose }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in font-normal">
    <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 max-w-3xl w-full shadow-2xl animate-scale-in border border-white/5 overflow-y-auto max-h-[90vh] custom-scrollbar">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-xl font-normal text-slate-900 dark:text-white uppercase tracking-tight">Delayed Applications</h3>
          <p className="text-[10px] text-slate-400 font-normal uppercase tracking-widest mt-1">Found {delayedRecords.length} records pending `{'>'}` 7 days</p>
        </div>
        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><Icons.Close className="w-5 h-5" /></button>
      </div>

      <div className="space-y-4">
        {delayedRecords.length === 0 ? (
          <div className="text-center py-10 text-slate-400 italic">No delayed applications detected.</div>
        ) : delayedRecords.map(r => {
          const creationDate = new Date(r.createdAt);
          const daysOld = Math.floor((Date.now() - creationDate.getTime()) / (1000 * 60 * 60 * 24));
          return (
            <div key={r.id} className="p-5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-normal text-slate-900 dark:text-white mb-0.5">{r.label}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <p className="text-[10px] text-slate-400 font-normal uppercase tracking-widest">{r.referenceNumber} • {r.status}</p>
                  <p className="text-[10px] text-indigo-400 font-normal uppercase tracking-widest">Created: {creationDate.toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-[10px] font-normal uppercase tracking-widest">
                  {daysOld} Days Delay
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10">
        <button 
          onClick={onClose}
          className="w-full py-3.5 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl font-normal uppercase text-[11px] tracking-widest shadow-md transition-all"
        >
          Close Dashboard
        </button>
      </div>
    </div>
  </div>
);

const EditModal: React.FC<{ record: RecordItem, onClose: () => void, onSave: (u: Partial<RecordItem>) => void }> = ({ record, onClose, onSave }) => {
  const [form, setForm] = useState<Partial<RecordItem>>({ ...record });
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    // Validation for USP
    if (form.status === 'USP' && (!form.sentToUSPDate || form.sentToUSPDate === '')) {
      setError("USP Date is mandatory when status is set to USP.");
      return;
    }
    setError(null);
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-fade-in font-normal">
      <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-10 max-w-2xl w-full shadow-2xl animate-scale-in border border-white/5 overflow-y-auto max-h-[90vh] custom-scrollbar">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-xl font-normal text-slate-900 dark:text-white uppercase tracking-tight">Edit Project</h3>
            <p className="text-[10px] text-slate-400 font-normal uppercase tracking-widest mt-1">Ref: {record.referenceNumber}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 transition-colors"><Icons.Close className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-sm animate-fade-in">
            <Icons.Alert className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <label className="text-[10px] font-normal text-slate-400 uppercase tracking-widest ml-1">Project Label</label>
            <input 
              value={form.label || ''} 
              onChange={e => setForm({ ...form, label: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-1 focus:ring-indigo-500 font-normal"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-normal text-slate-400 uppercase tracking-widest ml-1">Status</label>
            <select 
              value={form.status} 
              onChange={e => setForm({ ...form, status: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-1 focus:ring-indigo-500 appearance-none font-normal"
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className={`text-[10px] font-normal uppercase tracking-widest ml-1 ${form.status === 'USP' ? 'text-rose-500 font-medium' : 'text-slate-400'}`}>
              USP Date {form.status === 'USP' && '(REQUIRED)'}
            </label>
            <input 
              type="date"
              value={form.sentToUSPDate ? form.sentToUSPDate.split('T')[0] : ''} 
              onChange={e => setForm({ ...form, sentToUSPDate: e.target.value })}
              disabled={form.status !== 'USP' && !form.sentToUSPDate}
              className={`w-full px-4 py-3 bg-slate-50 dark:bg-black border rounded-xl text-sm outline-none transition-all font-normal ${
                form.status === 'USP' ? 'border-rose-300 dark:border-rose-500/30 focus:ring-rose-500' : 'border-slate-200 dark:border-white/10 focus:ring-indigo-500'
              }`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-normal text-slate-400 uppercase tracking-widest ml-1">Plot Number</label>
            <input 
              value={form.plotNumber || ''} 
              onChange={e => setForm({ ...form, plotNumber: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-1 focus:ring-indigo-500 font-normal"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-normal text-slate-400 uppercase tracking-widest ml-1">Wayleave</label>
            <input 
              value={form.wayleaveNumber || ''} 
              onChange={e => setForm({ ...form, wayleaveNumber: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-1 focus:ring-indigo-500 font-normal"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-normal text-slate-400 uppercase tracking-widest ml-1">Account Number</label>
            <input 
              value={form.accountNumber || ''} 
              onChange={e => setForm({ ...form, accountNumber: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-1 focus:ring-indigo-500 font-normal"
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-[10px] font-normal text-slate-400 uppercase tracking-widest ml-1">Remarks / Justification</label>
            <textarea 
              value={form.justification || ''} 
              onChange={e => setForm({ ...form, justification: e.target.value })}
              placeholder="Enter remarks or justification for status changes..."
              rows={3}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-xl text-sm outline-none focus:ring-1 focus:ring-indigo-500 font-normal resize-none"
            />
          </div>
        </div>

        <div className="mt-10 flex gap-3">
          <button 
            onClick={handleSave}
            className="flex-1 py-3.5 bg-indigo-600 text-white rounded-xl font-normal uppercase text-[11px] tracking-widest shadow-md hover:bg-indigo-700 transition-all"
          >
            Save Changes
          </button>
          <button 
            onClick={onClose}
            className="px-8 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-normal uppercase text-[11px] tracking-widest"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfirmModal: React.FC<{ message: string, onConfirm: () => void, onClose: () => void }> = ({ message, onConfirm, onClose }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-fade-in font-normal">
    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-10 max-w-md w-full shadow-2xl animate-scale-in border border-white/5 text-center">
      <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <Icons.Alert className="w-8 h-8 text-rose-500" />
      </div>
      <h3 className="text-xl font-normal text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Confirm Action</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 font-normal leading-relaxed mb-8">{message}</p>
      <div className="flex gap-3">
        <button onClick={onConfirm} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-normal uppercase text-[11px] tracking-widest shadow-md hover:bg-rose-700 transition-all">Confirm</button>
        <button onClick={onClose} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-normal uppercase text-[11px] tracking-widest">Cancel</button>
      </div>
    </div>
  </div>
);

// --- Main Views ---

const DashboardView: React.FC<{ 
  records: RecordItem[], 
  infraHookData: Record<string, { appNo: string, isPaid: boolean }>, 
  onSearch: (t: string) => void, 
  searchTerm: string,
  onUpload: () => void,
  onEdit: (r: RecordItem) => void,
  onDelete: (id: string) => void,
  onAlertsClick: () => void,
  delayedCount: number
}> = ({ records, infraHookData, onSearch, searchTerm, onUpload, onEdit, onDelete, onAlertsClick, delayedCount }) => {
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

  const paidCount = (Object.values(infraHookData) as { appNo: string, isPaid: boolean }[]).filter(v => v.isPaid).length;

  return (
    <div className="space-y-8 animate-fade-in-up font-normal">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard label="Live Portfolio" value={records.length} icon={Icons.Dashboard} color="bg-indigo-500" />
        <StatCard label="Infra Validated" value={paidCount} icon={Icons.Check} color="bg-emerald-500" />
        <StatCard 
          label="Delayed (>7 Days)" 
          value={delayedCount} 
          icon={Icons.Clock} 
          color="bg-rose-500" 
          onClick={delayedCount > 0 ? onAlertsClick : undefined}
        />
      </div>

      <div className="sticky top-0 z-20 -mx-8 px-8 py-4 bg-slate-50/80 dark:bg-black/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5 overflow-x-auto no-scrollbar">
        <div className="flex gap-2">
          {STATUS_SEQUENCE.map(status => {
            const count = status === "All Projects" ? records.length : records.filter(r => (r.status||'').toLowerCase() === status.toLowerCase()).length;
            return (
              <button
                key={status}
                onClick={() => setActiveTab(status)}
                className={`whitespace-nowrap px-5 py-2 rounded-2xl text-xs font-normal transition-all duration-300 border ${
                  activeTab === status 
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black border-transparent shadow-md' 
                    : 'bg-white dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {status.toUpperCase()} <span className="ml-2 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900/20 rounded-[2rem] border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
        <div className="p-8 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-slate-100 dark:border-white/5">
            <div>
                <h2 className="text-xl font-normal text-slate-900 dark:text-white tracking-tight">{activeTab}</h2>
                <p className="text-slate-400 text-[10px] font-normal uppercase tracking-widest mt-1">Found {filteredData.length} entries</p>
            </div>
            <div className="flex gap-3 w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                    <Icons.Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={searchTerm}
                      onChange={(e) => onSearch(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-slate-100/50 dark:bg-white/5 rounded-xl text-sm font-normal focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                    />
                </div>
                <button onClick={onUpload} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-normal shadow-sm transition-all active:scale-95 flex items-center gap-2 tracking-wide">
                    <Icons.Plus className="w-4 h-4" /> IMPORT
                </button>
            </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50/50 dark:bg-white/5">
              <tr>
                {["Project", "Stage", "Zone", "Reference", "Plot", "Infra Hook", ""].map(h => (
                  <th key={h} className="px-8 py-4 font-normal text-slate-400 uppercase text-[10px] tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filteredData.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-slate-400 italic">No records found.</td></tr>
              ) : filteredData.map((r) => (
                <tr key={r.id} className="group hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                  <td className="px-8 py-5">
                    <div className="font-normal text-slate-900 dark:text-white text-base">{r.label}</div>
                    <div className="text-[10px] text-slate-400 font-normal uppercase tracking-tight">{r.subtype || 'Project'}</div>
                  </td>
                  <td className="px-8 py-5">
                    <span className="px-2.5 py-0.5 rounded-lg bg-indigo-50/50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-normal uppercase tracking-wide border border-indigo-100 dark:border-indigo-500/20">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-slate-500 dark:text-slate-400">{r.zone}</td>
                  <td className="px-8 py-5 text-slate-400 font-mono text-[11px]">{r.referenceNumber}</td>
                  <td className="px-8 py-5 font-normal text-slate-700 dark:text-slate-300">{r.plotNumber || '-'}</td>
                  <td className="px-8 py-5">
                    <InfraHookBadge plot={r.plotNumber || ''} hookData={infraHookData} />
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(r)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Icons.Edit className="w-4 h-4" /></button>
                      <button onClick={() => onDelete(r.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><Icons.Trash className="w-4 h-4" /></button>
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

  const feesVal = parseFloat(fees) || 0;
  const ccVal = parseFloat(ccRef) || 0;
  const shareMultiplier = {'10':0.4, '12':0.375, '6.5':0.6923}[paymentType] || 0;
  const eddShare = feesVal * shareMultiplier;
  const finalCC = Math.max(0, ccVal - eddShare);

  return (
    <div className="flex flex-col lg:flex-row gap-8 min-h-[70vh] animate-fade-in-up font-normal">
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm">
          <h2 className="text-sm font-normal mb-6 text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-widest">
            <Icons.Search className="w-4 h-4 text-indigo-500" /> Database Search
          </h2>
          <div className="relative">
            <input 
              type="text" 
              placeholder="PLOT NUMBER..." 
              value={plotSearch}
              onChange={e => setPlotSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-5 pr-14 py-3 bg-slate-50 dark:bg-black border border-slate-200 dark:border-white/10 rounded-2xl font-normal text-lg outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            <button onClick={handleSearch} className="absolute right-2 top-2 bottom-2 px-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors">
              {loading ? <Icons.Spinner className="w-4 h-4 animate-spin" /> : <Icons.Right className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-white/5 shadow-sm">
           <h2 className="text-sm font-normal mb-6 text-slate-900 dark:text-white flex items-center gap-2 uppercase tracking-widest">
             <Icons.Calculator className="w-4 h-4 text-emerald-500" /> Audit Inputs
           </h2>
           <div className="flex gap-1 mb-6 p-1 bg-slate-100 dark:bg-black rounded-xl">
              {['10', '12', '6.5'].map(t => (
                  <button key={t} onClick={() => setPaymentType(t as any)} className={`flex-1 py-1.5 rounded-lg font-normal text-[10px] transition-all ${paymentType === t ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' : 'text-slate-400'}`}>{t} BD</button>
              ))}
           </div>
           <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-normal text-slate-400 uppercase ml-1 tracking-widest">Calculated Fees (BD)</label>
                <input type="number" placeholder="Enter Fees" value={fees} onChange={e => setFees(e.target.value)} className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black font-normal outline-none focus:ring-1 focus:ring-emerald-500 transition-all" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-normal text-slate-400 uppercase ml-1 tracking-widest">Original CC (BD)</label>
                <input type="number" placeholder="Enter Original CC" value={ccRef} onChange={e => setCcRef(e.target.value)} className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-black font-normal outline-none focus:ring-1 focus:ring-emerald-500 transition-all" />
              </div>
           </div>
           
           {(feesVal > 0 || ccVal > 0) && (
               <div className="mt-8 space-y-3 animate-scale-in">
                  <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10 flex justify-between items-center">
                      <div className="text-[10px] font-normal text-indigo-500 uppercase tracking-widest">Share Result</div>
                      <div className="text-lg font-normal text-indigo-600">{eddShare.toFixed(3)} BD</div>
                  </div>
                  {finalCC > 0 && (
                     <div className="p-5 bg-emerald-500 text-white rounded-2xl shadow-sm flex flex-col items-center">
                        <div className="text-[10px] font-normal uppercase tracking-widest opacity-80 mb-1">Adjusted Balance</div>
                        <div className="text-2xl font-normal">{finalCC.toFixed(3)} BD</div>
                     </div>
                  )}
               </div>
           )}
        </div>
      </div>

      <div className="w-full lg:w-2/3">
        {searchResult ? (
          <div className={`h-full rounded-[2.5rem] p-12 border transition-all duration-700 relative overflow-hidden flex flex-col ${hasPayments ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 shadow-sm' : 'bg-slate-50 dark:bg-slate-900 border-rose-500 shadow-sm'}`}>
            <div className={`absolute -right-32 -top-32 w-80 h-80 rounded-full blur-[80px] opacity-20 ${hasPayments ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-12">
                 <div>
                    <h3 className="text-[10px] font-normal uppercase tracking-widest opacity-50 mb-2">Status Report</h3>
                    <h1 className="text-5xl font-normal text-slate-900 dark:text-white tracking-tight leading-none">{searchResult.plotNumber}</h1>
                    <p className="text-xl font-normal opacity-80 mt-3 tracking-tight">{searchResult.ownerNameEn || 'Private Entity'}</p>
                 </div>
                 <div className={`w-24 h-24 rounded-3xl flex flex-col items-center justify-center shadow-md animate-bounce-subtle ${hasPayments ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                    {hasPayments ? <Icons.Check className="w-10 h-10 mb-1" /> : <Icons.Close className="w-10 h-10 mb-1" />}
                    <span className="text-[9px] font-normal tracking-wider">{hasPayments ? 'VERIFIED' : 'PENDING'}</span>
                 </div>
              </div>
              <div className={`p-10 rounded-3xl border text-center mb-10 transition-all ${hasPayments ? 'bg-white/80 dark:bg-black/40 border-emerald-100 dark:border-emerald-500/10' : 'bg-white/80 dark:bg-black/40 border-rose-100 dark:border-rose-500/10'}`}>
                  <span className={`text-3xl font-normal uppercase tracking-tight ${hasPayments ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {hasPayments ? 'Infrastructure Fees Cleared' : 'Incomplete Profile'}
                  </span>
                  <p className="text-slate-400 text-[10px] font-normal mt-2 uppercase tracking-widest">Database ID: {searchResult.id.split('-')[0]}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {['First', 'Second', 'Final'].map((label, i) => {
                      const keys = ['initialPaymentDate', 'secondPayment', 'thirdPayment'];
                      const val = (searchResult as any)[keys[i]];
                      const isFound = val && val.trim() !== '';
                      return (
                        <div key={label} className={`p-6 rounded-2xl border bg-white/50 dark:bg-black/20 backdrop-blur-md transition-all ${isFound ? 'border-emerald-200 dark:border-emerald-500/20' : 'border-slate-200 dark:border-white/5 opacity-50'}`}>
                           <div className="text-[10px] font-normal uppercase tracking-widest text-slate-400 mb-2">{label}</div>
                           <div className={`font-normal text-lg ${isFound ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-300 italic'}`}>
                             {isFound ? val : 'NOT RECORDED'}
                           </div>
                        </div>
                      );
                  })}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-white/10 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 gap-6 p-12">
             <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                <Icons.Search className="w-10 h-10 opacity-20" />
             </div>
             <div className="text-center">
                <p className="text-xl font-normal tracking-wide uppercase">Audit Readiness</p>
                <p className="text-xs font-normal opacity-60 mt-1">Enter a Plot ID to validate payments.</p>
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
  const [infraHookData, setInfraHookData] = useState<Record<string, { appNo: string, isPaid: boolean }>>({});
  
  const [feedback, setFeedback] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmState, setConfirmState] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [showDelayedModal, setShowDelayedModal] = useState(false);

  const delayedRecords = useMemo(() => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return records.filter(r => {
      const isPending = r.status !== 'Passed';
      const isOld = (now - new Date(r.createdAt).getTime()) > SEVEN_DAYS_MS;
      return isPending && isOld;
    });
  }, [records]);

  const [importProgress, setImportProgress] = useState<{ 
    total: number, current: number, active: boolean, success: number, error: number, finished: boolean,
    projectsDetected: number, infraDetected: number, summaryPhase: boolean, stagedProjects: any[], stagedInfra: any[]
  }>({
    total: 0, current: 0, active: false, success: 0, error: 0, finished: false,
    projectsDetected: 0, infraDetected: 0, summaryPhase: false, stagedProjects: [], stagedInfra: []
  });

  const loadData = async () => {
    setLoading(true);
    const data = await getRecords();
    setRecords(data);
    const plots = data.map(r => normalizePlot(r.plotNumber)).filter(Boolean);
    if (plots.length > 0) {
      setInfraHookData(await getInfraHookData(plots));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleExcelUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const resultData = e.target?.result;
      if (!resultData) return;
      
      const wb = XLSX.read(resultData, { type: 'binary' });
      const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      const stagedProjects: any[] = [];
      const stagedInfra: any[] = [];
      const lowerValidStatuses = VALID_IMPORT_STATUSES.map(s => s.toLowerCase().trim());

      const allDetectedPlots = rawData.map(r => normalizePlot(getValueByFuzzyKey(r, "Plot Number", "Plot"))).filter(Boolean);
      const existingPlots = await getExistingInfraPlots(allDetectedPlots);
      const existingRefs = new Set(records.map(r => r.referenceNumber));

      rawData.forEach((row: any) => {
        const ref = getValueByFuzzyKey(row, "Reference Number", "Reference", "Ref").toUpperCase();
        const plot = normalizePlot(getValueByFuzzyKey(row, "Plot Number", "Plot"));
        const sourceStatusRaw = getValueByFuzzyKey(row, "Status", "Workflow Status").trim();
        const sourceStatusLower = sourceStatusRaw.toLowerCase();
        const isValidStatus = lowerValidStatuses.includes(sourceStatusLower);

        if (isValidStatus && !existingRefs.has(ref)) {
          // Extract specific Creation Date if it exists
          const creationDateRaw = getValueByFuzzyKey(row, "Creation Date", "Entry Date", "Date Created", "Created At", "Workflow Entry Date");
          const projectCreationDate = creationDateRaw ? new Date(parseDateSafe(creationDateRaw)).toISOString() : new Date().toISOString();

          stagedProjects.push({
            label: getValueByFuzzyKey(row, "Label", "Title", "Project Name") || 'Untitled',
            status: mapSourceToUIStatus(sourceStatusRaw),
            plotNumber: plot,
            referenceNumber: ref,
            zone: getValueByFuzzyKey(row, "Zone") || '',
            block: getValueByFuzzyKey(row, "Block") || '',
            scheduleStartDate: parseDateSafe(getValueByFuzzyKey(row, "Schedule Start", "Start Date")),
            wayleaveNumber: getValueByFuzzyKey(row, "Wayleave") || '',
            accountNumber: getValueByFuzzyKey(row, "Account") || '',
            requireUSP: false,
            createdAt: projectCreationDate
          });
        } 
        else if (plot && plot !== '' && !existingPlots.has(plot)) {
          stagedInfra.push({
            applicationNumber: getValueByFuzzyKey(row, "Application Number", "App No"),
            plotNumber: plot,
            ownerNameEn: getValueByFuzzyKey(row, "Owner"),
            initialPaymentDate: getValueByFuzzyKey(row, "First Installment", "Initial Payment"),
            secondPayment: getValueByFuzzyKey(row, "Second Installment"),
            thirdPayment: getValueByFuzzyKey(row, "Final Settlement"),
            createdAt: new Date().toISOString()
          });
        }
      });

      setImportProgress({
        total: stagedProjects.length + stagedInfra.length,
        current: 0,
        active: true,
        success: 0,
        error: 0,
        finished: false,
        projectsDetected: stagedProjects.length,
        infraDetected: stagedInfra.length,
        summaryPhase: true,
        stagedProjects,
        stagedInfra
      });
    };
    reader.readAsBinaryString(file);
  };

  const startSync = async () => {
    setImportProgress(prev => ({ ...prev, summaryPhase: false }));
    for (let i = 0; i < importProgress.stagedProjects.length; i++) {
      const item = importProgress.stagedProjects[i];
      const result = await addRecord(item as RecordItem);
      setImportProgress(prev => ({
        ...prev,
        current: prev.current + 1,
        success: result ? prev.success + 1 : prev.success,
        error: !result ? prev.error + 1 : prev.error
      }));
    }
    if (importProgress.stagedInfra.length > 0) {
      const success = await saveInfraReferences(importProgress.stagedInfra);
      setImportProgress(prev => ({
        ...prev,
        current: prev.current + prev.stagedInfra.length,
        success: success ? prev.success + prev.stagedInfra.length : prev.success,
        error: !success ? prev.error + prev.stagedInfra.length : prev.error
      }));
    }
    await loadData();
    setImportProgress(prev => ({ ...prev, finished: true }));
  };

  const handleDelete = (id: string) => {
    setConfirmState({
      message: "Confirm deletion of this record? This cannot be undone.",
      onConfirm: async () => {
        const success = await deleteRecord(id);
        if (success) {
          setFeedback({ message: "Record removed", type: 'success' });
          loadData();
        } else {
          setFeedback({ message: "Action failed", type: 'error' });
        }
        setConfirmState(null);
      }
    });
  };

  const handleUpdateRecord = async (updates: Partial<RecordItem>) => {
    if (!editingRecord) return;
    const success = await updateRecord(editingRecord.id, updates);
    if (success) {
      setFeedback({ message: "Record updated", type: 'success' });
      setEditingRecord(null);
      loadData();
    } else {
      setFeedback({ message: "Update failed", type: 'error' });
    }
  };

  if (loading) return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <Icons.Spinner className="w-10 h-10 text-indigo-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-400 font-normal text-xs uppercase tracking-widest">Nexus System Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-black font-sans text-slate-900 dark:text-slate-100 flex overflow-hidden">
      <aside className="w-20 lg:w-64 bg-slate-900/95 dark:bg-slate-950/80 backdrop-blur-xl text-white flex flex-col fixed h-full z-50 border-r border-white/5 font-normal">
        <div className="p-8 flex flex-col items-center lg:items-start gap-3">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg overflow-hidden p-1.5">
                <img src={EWA_LOGO} alt="EWA Logo" className="w-full h-full object-contain" />
            </div>
            <div className="hidden lg:block">
                <h1 className="font-normal text-lg tracking-tight uppercase leading-none">Rajab Management</h1>
                <p className="text-[9px] font-normal text-indigo-400 tracking-widest mt-1 uppercase">Nexus System</p>
            </div>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          {[
            { id: 'dashboard', icon: Icons.Dashboard, label: 'Control Hub' },
            { id: 'calculator', icon: Icons.Calculator, label: 'Audit Engine' }
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setCurrentView(item.id as any)}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all duration-300 group ${
                currentView === item.id 
                  ? 'bg-white/10 text-white border border-white/5 shadow-sm' 
                  : 'text-slate-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <item.icon className={`w-5 h-5 transition-colors ${currentView === item.id ? 'text-indigo-400' : 'group-hover:text-indigo-400'}`} />
              <span className="hidden lg:block font-normal text-xs uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-6">
            {delayedRecords.length > 0 && (
              <button 
                onClick={() => setShowDelayedModal(true)}
                className="w-full mb-3 flex items-center justify-center gap-2 py-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 hover:bg-rose-500/20 transition-all group"
              >
                <Icons.Alert className="w-4 h-4 animate-pulse-fast" />
                <span className="hidden lg:block text-[10px] uppercase tracking-widest">Alerts ({delayedRecords.length})</span>
              </button>
            )}
            <div className="hidden lg:block p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 text-center">
                <p className="text-[9px] font-normal uppercase text-indigo-400 tracking-widest mb-1.5">System Status</p>
                <div className="flex items-center justify-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="font-normal text-[10px]">OPERATIONAL</span>
                </div>
            </div>
        </div>
      </aside>

      <main className="flex-1 ml-20 lg:ml-64 p-10 overflow-y-auto h-screen custom-scrollbar font-normal">
        <div className="max-w-7xl mx-auto">
           {currentView === 'dashboard' ? (
             <DashboardView 
               records={records} 
               infraHookData={infraHookData} 
               searchTerm={searchTerm} 
               onSearch={setSearchTerm} 
               onUpload={() => setShowUpload(true)}
               onEdit={(r) => setEditingRecord(r)}
               onDelete={handleDelete}
               onAlertsClick={() => setShowDelayedModal(true)}
               delayedCount={delayedRecords.length}
             />
           ) : <CalculatorView />}
        </div>

        {/* --- Global Modals --- */}
        
        {showDelayedModal && (
          <DelayedAlertModal delayedRecords={delayedRecords} onClose={() => setShowDelayedModal(false)} />
        )}

        {editingRecord && (
          <EditModal record={editingRecord} onClose={() => setEditingRecord(null)} onSave={handleUpdateRecord} />
        )}

        {confirmState && (
          <ConfirmModal message={confirmState.message} onConfirm={confirmState.onConfirm} onClose={() => setConfirmState(null)} />
        )}

        {feedback && (
          <FeedbackMessage message={feedback.message} type={feedback.type} onClose={() => setFeedback(null)} />
        )}

        {showUpload && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in font-normal">
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 max-w-xl w-full shadow-2xl animate-scale-in border border-white/5 overflow-y-auto max-h-[90vh] custom-scrollbar">
                    {importProgress.active ? (
                      <div className="text-center py-4">
                        {importProgress.summaryPhase ? (
                          <div className="animate-fade-in text-left">
                             <div className="text-center mb-8">
                                <h3 className="text-xl font-normal mb-1 text-slate-900 dark:text-white uppercase tracking-tight">Data Scan Ready</h3>
                                <p className="text-[10px] text-slate-400 font-normal uppercase tracking-widest">Historical dates used for alerts</p>
                             </div>
                             
                             <div className="grid grid-cols-2 gap-4 mb-8">
                                <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                                    <div className="font-normal text-indigo-500 uppercase text-[9px] tracking-widest mb-1">New Projects</div>
                                    <div className="text-3xl font-normal text-slate-900 dark:text-white">{importProgress.projectsDetected}</div>
                                </div>
                                <div className="p-5 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                                    <div className="font-normal text-emerald-500 uppercase text-[9px] tracking-widest mb-1">New Infra</div>
                                    <div className="text-3xl font-normal text-slate-900 dark:text-white">{importProgress.infraDetected}</div>
                                </div>
                             </div>

                             <div className="flex gap-3">
                                <button onClick={startSync} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-normal uppercase text-[11px] tracking-widest shadow-md transition-all hover:bg-indigo-700">Sync Now</button>
                                <button onClick={() => setShowUpload(false)} className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-normal uppercase text-[11px] tracking-widest">Cancel</button>
                             </div>
                          </div>
                        ) : !importProgress.finished ? (
                          <>
                            <div className="w-20 h-20 rounded-full border-2 border-slate-100 dark:border-white/5 flex items-center justify-center mx-auto mb-8 relative">
                               <div className="absolute inset-0 border-2 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                               <span className="text-lg font-normal">{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                            </div>
                            <h3 className="text-xl font-normal mb-1 text-slate-900 dark:text-white uppercase tracking-tight">Syncing...</h3>
                            <p className="text-[10px] text-slate-400 font-normal uppercase tracking-widest mb-8">Injecting {importProgress.current} records</p>
                          </>
                        ) : (
                          <div className="animate-scale-in">
                             <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-md">
                                <Icons.Check className="w-8 h-8" />
                             </div>
                             <h3 className="text-xl font-normal mb-1 text-slate-900 dark:text-white uppercase tracking-tight">Task Complete</h3>
                             <p className="text-[10px] text-slate-400 font-normal uppercase tracking-widest mb-8">Sync operation successful</p>
                             
                             <button onClick={() => { setImportProgress({ total:0, current:0, active:false, success:0, error:0, finished:false, projectsDetected:0, infraDetected:0, summaryPhase: false, stagedProjects:[], stagedInfra:[] }); setShowUpload(false); }} className="w-full py-3 bg-slate-900 dark:bg-white text-white dark:text-black rounded-xl font-normal uppercase text-[11px] tracking-widest transition-all">Dismiss</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center font-normal">
                          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                              <Icons.Excel className="w-8 h-8 text-indigo-600" />
                          </div>
                          <h3 className="text-xl font-normal mb-2 text-slate-900 dark:text-white tracking-tight uppercase">Import Dataset</h3>
                          <p className="text-xs text-slate-500 mb-8 font-normal leading-relaxed text-center">Excel synchronization. We will use the 'Creation Date' or 'Entry Date' from your file to track delays. Duplicates are auto-skipped.</p>
                          
                          <input type="file" id="upload-input" className="hidden" accept=".xlsx" onChange={(e) => e.target.files?.[0] && handleExcelUpload(e.target.files[0])} />
                          <div className="flex flex-col gap-2">
                              <label htmlFor="upload-input" className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-normal cursor-pointer hover:bg-indigo-700 transition-all shadow-md uppercase text-[11px] tracking-widest text-center">Browse Files</label>
                              <button onClick={() => setShowUpload(false)} className="w-full py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-normal hover:bg-slate-200 transition-all uppercase text-[11px] tracking-widest">Close Interface</button>
                          </div>
                      </div>
                    )}
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;
