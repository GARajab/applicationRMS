import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Icons } from './components/Icons';
import * as XLSX from 'xlsx';
import { RecordItem, InfraReferenceItem } from './types';
import { getRecords, addRecord, deleteRecord, updateRecord, searchInfraReferences, saveInfraReferences, clearInfraReferences, getInfraStats, getPaidPlotNumbers } from './services/storageService';
import { generateDataInsights, generateRecordReport } from './services/geminiService';

// --- Constants ---
const STATUS_SEQUENCE = [
  "Assign planning", "Site Visit", "Design", "Design approval", 
  "GIS digitalization", "Wayleave", "Cost estimation", 
  "Attach Utilities Drawing", "Engineer approval", "Redesign", 
  "Suspended by EDD", "Work Design"
];

// --- Helper Functions ---
const parseDateSafe = (value: any): string => {
  if (!value) return '';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0]; // Return YYYY-MM-DD
};

const normalizeStatus = (s: string) => (s || '').trim().toLowerCase();

const normalizePlot = (s: any) => String(s || '').trim();

// Fuzzy matcher for Excel headers
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

// Colors
const getStatusColor = (status: string) => {
  const s = normalizeStatus(status);
  if (['passed', 'engineer approval', 'work design', 'design approval'].includes(s)) return 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20';
  if (s === 'suspended by edd' || s === 'cancelled') return 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20 animate-pulse';
  if (s.includes('gis')) return 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
  if (s.includes('wayleave')) return 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20';
  if (s === 'redesign') return 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20';
  return 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
};

// --- Components ---

const LoadingScreen: React.FC = () => (
  <div className="fixed inset-0 bg-slate-50 dark:bg-slate-900 z-[100] flex flex-col items-center justify-center animate-fade-in">
    <div className="relative mb-8">
      <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl animate-pulse"></div>
      <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 animate-bounce-subtle">
        <Icons.Dashboard className="w-10 h-10 text-white animate-pulse" />
      </div>
    </div>
    <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Planning Dashboard</h1>
    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
      <Icons.Spinner className="w-5 h-5 animate-spin text-emerald-500" />
      <span className="text-sm font-medium">Initializing system...</span>
    </div>
  </div>
);

// --- Chat Page Component ---
const ChatPage: React.FC<{ records: RecordItem[] }> = ({ records }) => {
  const [messages, setMessages] = useState<{id: string, role: 'user' | 'bot', content: string, timestamp: number}[]>([
    { id: 'welcome', role: 'bot', content: 'Hello! I am your AI Project Assistant. I can access both your active records and the full infrastructure database. Please provide a **Project Number**, **Plot Number**, or **Reference**, and I will generate a full status report.', timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { id: Date.now().toString(), role: 'user' as const, content: input, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const searchTerm = normalizePlot(userMsg.content);
    let foundRecord: any = records.find(r => 
      (r.referenceNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      normalizePlot(r.plotNumber) === searchTerm ||
      (r.label || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!foundRecord) {
         try {
             const infraResults = await searchInfraReferences(searchTerm);
             if (infraResults && infraResults.length > 0) {
                 foundRecord = infraResults.find(r => normalizePlot(r.plotNumber) === searchTerm) || infraResults[0];
             }
         } catch (err) { console.error("Chat search error:", err); }
    }

    const botResponseContent = foundRecord ? await generateRecordReport(foundRecord) : `I searched both the active projects and the uploaded database but couldn't find a record matching "**${userMsg.content}**".`;
    
    setIsTyping(false);
    setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'bot', content: botResponseContent, timestamp: Date.now() }]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-scale-in">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg animate-bounce-subtle"><Icons.AI className="w-6 h-6 text-white" /></div>
        <div><h3 className="font-bold text-slate-900 dark:text-white">AI Project Assistant</h3><p className="text-xs text-slate-600 dark:text-slate-400">Powered by Gemini 3</p></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-black/20">
        {messages.map((msg, idx) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`} style={{ animationDelay: `${idx * 0.05}s` }}>
            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-700'}`}>
              <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
            </div>
          </div>
        ))}
        {isTyping && <div className="flex justify-start animate-pulse"><div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm"><span className="text-slate-400 text-xs">AI thinking...</span></div></div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
         <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="Enter Plot No, Ref, or App No..." className="flex-1 pl-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium transition-all focus:scale-[1.01]" />
         <button onClick={handleSend} disabled={!input.trim() || isTyping} className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-transform active:scale-95"><Icons.Send className="w-5 h-5" /></button>
      </div>
    </div>
  );
};

// --- Infra Calculator Page ---
const InfraCalculatorPage: React.FC = () => {
  const [paymentType, setPaymentType] = useState<'10' | '12' | '6.5'>('10');
  const [fees, setFees] = useState('');
  const [ccRef, setCcRef] = useState('');
  const [searchResult, setSearchResult] = useState<InfraReferenceItem | null>(null);
  const [plotSearch, setPlotSearch] = useState('');
  const [dbCount, setDbCount] = useState<number>(0);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => { getInfraStats().then(s => setDbCount(s.count)); }, []);

  const eddShare = parseFloat(fees) * ({'10':0.4, '12':0.375, '6.5':0.6923}[paymentType] || 0) || 0;
  const finalCC = Math.max(0, (parseFloat(ccRef) || 0) - eddShare);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoadingReferences(true);
    setUploadStatus('Reading...');
    const reader = new FileReader();
    reader.onload = async (evt) => {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        setUploadStatus(`Uploading ${jsonData.length}...`);
        
        const dbItems = jsonData.map((row: any) => ({
            plotNumber: getValueByFuzzyKey(row, "Parcel / Plot number", "Plot number", "Plot", "Parcel Number"),
            // More robust fuzzy keys for payments
            initialPaymentDate: getValueByFuzzyKey(row, "Initial Payment Date", "1st Payment", "Initial Pmt", "First Payment"),
            secondPayment: getValueByFuzzyKey(row, "Second Payment", "2nd Payment"),
            thirdPayment: getValueByFuzzyKey(row, "Third payment", "3rd Payment"),
            ownerNameEn: getValueByFuzzyKey(row, "Owner English Name", "Owner Name", "Owner"),
            ewaFeeStatus: getValueByFuzzyKey(row, "EWA Fee Status", "Fee Status")
        }));

        await saveInfraReferences(dbItems);
        const s = await getInfraStats();
        setDbCount(s.count);
        setIsLoadingReferences(false);
        setUploadStatus('');
        alert("Upload complete.");
    };
    reader.readAsBinaryString(file);
  };

  const handleSearch = async () => {
      const term = normalizePlot(plotSearch);
      if (!term) return;
      setSearchResult(null);
      
      const results = await searchInfraReferences(term);
      // Prioritize exact match
      const exactMatch = results.find(r => normalizePlot(r.plotNumber) === term);
      setSearchResult(exactMatch || results[0] || null);
  };

  return (
    <div className="w-full h-full flex flex-col md:flex-row gap-8 animate-fade-in-up">
      <div className="md:w-1/2 flex flex-col gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 hover:shadow-md transition-shadow">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-900 dark:text-white"><Icons.Calculator className="text-emerald-500" /> Fee Calculator</h2>
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">{['10', '12', '6.5'].map(t => <button key={t} onClick={() => setPaymentType(t as any)} className={`py-3 rounded-xl font-bold border transition-all active:scale-95 ${paymentType === t ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg' : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'}`}>{t}</button>)}</div>
            <input type="number" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="Enter fees (BD)..." className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-medium transition-shadow focus:shadow-md" />
            <input type="number" value={ccRef} onChange={(e) => setCcRef(e.target.value)} placeholder="Enter 13/2006 CC (BD)..." className="w-full p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none font-medium transition-shadow focus:shadow-md" />
            <div className={`p-5 rounded-2xl border transition-all duration-300 transform ${finalCC > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900 scale-105' : 'bg-slate-100 border-slate-200 text-slate-800'}`}>
                <div className="text-2xl font-bold">{finalCC.toLocaleString()} BD</div>
                <div className="text-xs text-slate-500 uppercase font-semibold mt-1">Final Cost Recovery</div>
            </div>
          </div>
        </div>
      </div>
      <div className="md:w-1/2 flex flex-col gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 flex flex-col hover:shadow-md transition-shadow">
            <div className="flex justify-between mb-6"><h2 className="text-xl font-bold text-slate-900 dark:text-white">Plot Lookup</h2><span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-bold">{dbCount} Records</span></div>
            {dbCount === 0 && !isLoadingReferences && <div className="text-center p-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-emerald-500 transition-colors cursor-pointer group"><input type="file" id="calc-upload" className="hidden" onChange={handleFileUpload} /><label htmlFor="calc-upload" className="px-4 py-2 bg-slate-900 text-white rounded-lg cursor-pointer hover:bg-slate-800 font-bold text-sm transition-colors group-hover:scale-105 inline-block">Upload Database</label></div>}
            <div className="relative mb-4"><input type="text" placeholder="Search Plot..." value={plotSearch} onChange={e => setPlotSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} className="w-full p-3 pl-10 border border-slate-300 rounded-xl bg-white text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none font-bold transition-shadow focus:shadow-md" /><Icons.Search className="absolute left-3 top-3 text-slate-400" /><button onClick={handleSearch} className="absolute right-2 top-2 bg-blue-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-blue-700 transition-colors">Search</button></div>
            
            <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 p-4 min-h-[300px]">
            {searchResult ? (
                <div className="space-y-3 animate-fade-in-up">
                    <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                         <span className="text-xs font-bold text-slate-500 uppercase">Plot Number</span>
                         <span className="text-lg font-bold text-slate-900">{searchResult.plotNumber}</span>
                    </div>
                    {searchResult.ownerNameEn && (
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                             <span className="text-xs font-bold text-slate-500 uppercase">Owner</span>
                             <span className="text-sm font-medium text-slate-800">{searchResult.ownerNameEn}</span>
                        </div>
                    )}
                     {searchResult.ewaFeeStatus && (
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                             <span className="text-xs font-bold text-slate-500 uppercase">Fee Status</span>
                             <span className="text-sm font-medium text-slate-800">{searchResult.ewaFeeStatus}</span>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 gap-2 mt-4">
                        {[
                            { label: 'Initial Payment', val: searchResult.initialPaymentDate },
                            { label: 'Second Payment', val: searchResult.secondPayment },
                            { label: 'Third Payment', val: searchResult.thirdPayment },
                        ].map((item, i) => (
                            <div key={item.label} className="p-3 bg-white border border-slate-200 rounded-lg animate-slide-in-right" style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}>
                                <span className="block text-xs font-bold text-slate-500 uppercase mb-1">{item.label}</span>
                                <span className={`block font-bold ${item.val && item.val.trim() ? 'text-emerald-600' : 'text-slate-400 italic'}`}>
                                    {item.val && item.val.trim() ? item.val : 'Not Recorded'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm italic animate-pulse">
                    {plotSearch && !searchResult ? 'No record found.' : 'Enter plot number to search.'}
                </div>
            )}
            </div>
        </div>
      </div>
    </div>
  );
};

const EditRecordModal: React.FC<{ isOpen: boolean; record: RecordItem | null; onClose: () => void; onSave: (id: string, updates: Partial<RecordItem>) => Promise<void> }> = ({ isOpen, record, onClose, onSave }) => {
  const [formData, setFormData] = useState<Partial<RecordItem>>({});
  useEffect(() => { if (record) setFormData(record); }, [record]);

  if (!isOpen || !record) return null;
  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl p-6 shadow-xl max-h-[90vh] overflow-y-auto border border-slate-200 animate-scale-in">
        <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">Edit Record</h2>
        <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600">Label</label>
              <input type="text" value={formData.label || ''} onChange={e => setFormData({...formData, label: e.target.value})} className="w-full p-3 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600">Status</label>
              <input type="text" value={formData.status || ''} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full p-3 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600">Plot Number</label>
              <input type="text" value={formData.plotNumber || ''} onChange={e => setFormData({...formData, plotNumber: e.target.value})} className="w-full p-3 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" />
            </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="px-4 py-2 rounded-lg hover:bg-slate-100 text-slate-700 font-bold text-sm border border-transparent transition-colors">Cancel</button>
            <button onClick={() => { onSave(record.id, formData); onClose(); }} className="px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95">Save</button>
        </div>
      </div>
    </div>
  );
};

const ExcelUploader: React.FC<{ onUpload: (data: any[]) => void }> = ({ onUpload }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const processFile = (file: File) => {
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      const mapped = jsonData.map((row: any, i) => ({
             id: '',
             label: getValueByFuzzyKey(row, "Label", "Title") || `Imported ${i + 1}`,
             subtype: getValueByFuzzyKey(row, "Subtype"),
             type: getValueByFuzzyKey(row, "Type"),
             status: getValueByFuzzyKey(row, "Status") || "Assign planning",
             phase: getValueByFuzzyKey(row, "Phase"),
             block: getValueByFuzzyKey(row, "Block", "Block number") || '',
             zone: getValueByFuzzyKey(row, "Zone") || '',
             scheduleStartDate: parseDateSafe(getValueByFuzzyKey(row, "Schedule start date", "Start Date")),
             scheduleEndDate: parseDateSafe(getValueByFuzzyKey(row, "Schedule end date", "End Date")),
             userConnected: getValueByFuzzyKey(row, "User connected"),
             createdBy: getValueByFuzzyKey(row, "Created by"),
             capitalContribution: getValueByFuzzyKey(row, "Capital contribution"),
             nominatedContractor: getValueByFuzzyKey(row, "Nominated contractor"),
             urgent: String(getValueByFuzzyKey(row, "Urgent")).toLowerCase() === 'yes',
             lastShutdown: getValueByFuzzyKey(row, "Last shutdown"),
             planningEngineer: getValueByFuzzyKey(row, "Planning engineer assigned"),
             constructionEngineer: getValueByFuzzyKey(row, "Construction engineer assigned"),
             supervisor: getValueByFuzzyKey(row, "Supervisor assigned"),
             wayleaveNumber: getValueByFuzzyKey(row, "Wayleave number"),
             plannedTotalCost: getValueByFuzzyKey(row, "Planned total cost"),
             plannedMaterialCost: getValueByFuzzyKey(row, "Planned material cost"),
             plannedServiceCost: getValueByFuzzyKey(row, "Planned service cost"),
             paymentDate: parseDateSafe(getValueByFuzzyKey(row, "Payment date")),
             totalPower: getValueByFuzzyKey(row, "Total power"),
             contractorAssignDate: parseDateSafe(getValueByFuzzyKey(row, "Contractor assign date")),
             workOrder: getValueByFuzzyKey(row, "IO/ Work Order", "Work Order"),
             plotNumber: getValueByFuzzyKey(row, "Plot Number", "Parcel / Plot number", "Plot"),
             accountNumber: getValueByFuzzyKey(row, "Account number"),
             customerCpr: getValueByFuzzyKey(row, "Customer CPR"),
             referenceNumber: getValueByFuzzyKey(row, "Reference Number"),
             jobType: getValueByFuzzyKey(row, "Job type"),
             governorate: getValueByFuzzyKey(row, "Governorate"),
             nasCode: getValueByFuzzyKey(row, "NAS Code"),
             description: getValueByFuzzyKey(row, "Description"),
             mtcContractor: getValueByFuzzyKey(row, "MTC Contractor"),
             workflowEntryDate: parseDateSafe(getValueByFuzzyKey(row, "Workflow entry state date")),
             contractorPaymentDate: parseDateSafe(getValueByFuzzyKey(row, "Contractor Payment Date")),
             installationContractor: getValueByFuzzyKey(row, "Installation contractor"),
             createdAt: new Date().toISOString()
      }));
      onUpload(mapped);
      setIsProcessing(false);
    };
    reader.readAsBinaryString(file);
  };

  return (
     <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-10 text-center hover:border-emerald-500 transition-colors bg-slate-50 dark:bg-slate-900/50 group animate-fade-in-up">
        {isProcessing ? <Icons.Spinner className="w-10 h-10 mx-auto text-emerald-500 animate-spin" /> : (
            <>
                <Icons.Excel className="w-12 h-12 mx-auto text-emerald-500 mb-4 group-hover:scale-110 transition-transform" />
                <p className="font-bold text-slate-800 dark:text-white text-lg">Upload Spreadsheet</p>
                <input type="file" className="hidden" id="main-upload" accept=".xlsx, .xls" onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])} />
                <label htmlFor="main-upload" className="inline-block mt-4 px-6 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg font-bold cursor-pointer hover:bg-slate-800 transition-transform active:scale-95 shadow-md">Select File</label>
            </>
        )}
     </div>
  );
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'dashboard' | 'calculator' | 'chat'>('dashboard');
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RecordItem | null>(null);
  const [paidPlots, setPaidPlots] = useState<Set<string>>(new Set());

  useEffect(() => { loadRecords(); }, []);

  const loadRecords = async () => {
    setLoading(true);
    const data = await getRecords();
    setRecords(data);
    
    // Normalize plots to ensure we find matches even if data is dirty
    const plots = data.map(r => normalizePlot(r.plotNumber)).filter(Boolean);
    
    if (plots.length > 0) {
      // NOTE: getPaidPlotNumbers now filters to return only plots WITH valid payments
      const paid = await getPaidPlotNumbers(plots);
      setPaidPlots(paid);
    }
    setLoading(false);
  };

  const handleExcelUpload = async (data: any[]) => {
    setLoading(true);
    let added = 0;
    for (const item of data) if (await addRecord(item)) added++;
    await loadRecords();
    setShowUpload(false);
    alert(`Imported ${added} records.`);
  };

  const tableHeaders = [
    "Label", "Subtype", "Zone", "Wayleave", "Plot No", "Account", 
    "Ref No", "Job Type", "Created Date", "Infra Y/N"
  ];

  const filteredRecords = useMemo(() => {
    return records.filter(r => (r.label||'').toLowerCase().includes(searchTerm.toLowerCase()) || (r.plotNumber||'').includes(searchTerm));
  }, [records, searchTerm]);

  if (loading && records.length === 0) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 flex">
      <aside className="w-64 bg-slate-900 text-white hidden md:flex flex-col fixed h-full z-20 shadow-2xl">
         <div className="p-6 flex items-center gap-3"><div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center animate-pulse-slow"><Icons.Dashboard className="w-5 h-5 text-white" /></div><h1 className="font-bold text-lg tracking-tight">PlanManager</h1></div>
         <nav className="flex-1 px-4 py-6 space-y-2">
            {['dashboard', 'calculator', 'chat'].map(v => (
                <button key={v} onClick={() => setCurrentView(v as any)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium capitalize transition-all duration-200 ${currentView === v ? 'bg-white/10 text-emerald-400 translate-x-1 shadow-inner' : 'text-slate-400 hover:text-white hover:bg-white/5 hover:translate-x-1'}`}>
                    {v === 'dashboard' ? <Icons.Dashboard /> : v === 'calculator' ? <Icons.Calculator /> : <Icons.ChatBubble />} {v}
                </button>
            ))}
         </nav>
      </aside>

      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-y-auto">
        {currentView === 'calculator' ? <InfraCalculatorPage /> : currentView === 'chat' ? <ChatPage records={records} /> : (
            <div className="animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white animate-slide-in-right">Project Overview</h2>
                    <div className="flex gap-2 animate-slide-in-right" style={{ animationDelay: '100ms' }}>
                         <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="p-2.5 border border-slate-300 rounded-lg bg-white text-slate-900 focus:ring-1 focus:ring-blue-500 outline-none text-sm w-64 font-medium transition-shadow focus:shadow-md" />
                         <button onClick={() => setShowUpload(true)} className="px-4 py-2 bg-slate-900 text-white rounded-lg flex gap-2 items-center text-sm font-bold hover:bg-slate-800 transition-transform active:scale-95"><Icons.Plus className="w-4 h-4" /> Add</button>
                    </div>
                </div>

                {showUpload && <div className="mb-6"><ExcelUploader onUpload={handleExcelUpload} /><button onClick={() => setShowUpload(false)} className="text-red-600 mt-2 text-sm font-bold hover:underline">Cancel</button></div>}

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden overflow-x-auto animate-scale-in">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-xs font-bold text-slate-600 uppercase tracking-wider">
                            <tr>{tableHeaders.map(h => <th key={h} className="p-4 border-b border-slate-200 dark:border-slate-800">{h}</th>)}<th className="p-4 border-b border-slate-200 dark:border-slate-800">Actions</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredRecords.map((r, index) => {
                                const hasInfra = r.plotNumber && paidPlots.has(normalizePlot(r.plotNumber));
                                return (
                                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors animate-fade-in-up" style={{ animationDelay: `${index * 30}ms`, animationFillMode: 'both' }}>
                                    <td className="p-4 font-bold text-slate-900 dark:text-white">{r.label}</td>
                                    <td className="p-4 text-slate-700 dark:text-slate-300">{r.subtype || '-'}</td>
                                    <td className="p-4 text-slate-700 dark:text-slate-300">{r.zone}</td>
                                    <td className="p-4 text-slate-700 dark:text-slate-300">{r.wayleaveNumber}</td>
                                    <td className="p-4 font-mono font-bold text-slate-800 dark:text-slate-200">{r.plotNumber || '-'}</td>
                                    <td className="p-4 text-slate-700 dark:text-slate-300">{r.accountNumber}</td>
                                    <td className="p-4 text-slate-700 dark:text-slate-300">{r.referenceNumber}</td>
                                    <td className="p-4 text-slate-700 dark:text-slate-300">{r.jobType || '-'}</td>
                                    <td className="p-4 text-slate-700 dark:text-slate-300">{parseDateSafe(r.createdAt)}</td>
                                    <td className="p-4 font-bold text-center">
                                        {hasInfra ? (
                                            <span className="inline-flex items-center justify-center w-12 py-1 bg-red-100 text-red-700 rounded-md border border-red-200 text-xs uppercase tracking-wide animate-pulse-slow">Yes</span>
                                        ) : (
                                            <span className="inline-flex items-center justify-center w-12 py-1 bg-green-100 text-green-700 rounded-md border border-green-200 text-xs uppercase tracking-wide">No</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button onClick={() => setEditingRecord(r)} className="text-blue-600 hover:text-blue-800 p-1.5 rounded-md hover:bg-blue-50 transition-colors"><Icons.Edit className="w-4 h-4" /></button>
                                        <button onClick={() => { if(confirm('Delete?')) { deleteRecord(r.id).then(loadRecords); } }} className="text-red-600 hover:text-red-800 p-1.5 rounded-md hover:bg-red-50 transition-colors"><Icons.Trash className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
        <EditRecordModal isOpen={!!editingRecord} record={editingRecord} onClose={() => setEditingRecord(null)} onSave={async (id, up) => { await updateRecord(id, up); loadRecords(); }} />
      </main>
    </div>
  );
};

export default App;