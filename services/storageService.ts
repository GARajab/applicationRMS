
import { supabase } from './supabaseClient';
import { RecordItem, InfraReferenceItem } from '../types';

// Helper to normalize plot numbers for consistent matching
const normalizePlot = (p: string | number | null | undefined): string => {
  if (!p) return '';
  return String(p).trim().toUpperCase();
};

/**
 * List of columns guaranteed to exist in the standard database schema.
 */
const SAFE_COLUMNS = [
  'label', 'status', 'block', 'zone', 'scheduleStartDate', 
  'wayleaveNumber', 'accountNumber', 'referenceNumber', 
  'requireUSP', 'sentToUSPDate', 'justification', 'createdAt',
  'plotNumber', 'applicationNumber', 'momaaLoad', 'subtype'
];

const prunePayload = (obj: any) => {
  const pruned: any = {};
  Object.keys(obj).forEach(key => {
    const val = obj[key];
    if (SAFE_COLUMNS.includes(key) && val !== undefined && val !== null && val !== '') {
      pruned[key] = val;
    }
  });
  return pruned;
};

export const getRecords = async (): Promise<RecordItem[]> => {
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .order('createdAt', { ascending: false });
  
  if (error) {
    console.error('Error fetching records:', error);
    return [];
  }
  
  return (data || []).map((item: any) => ({
    ...item,
    id: item.id,
    label: item.label || 'Untitled',
    status: item.status || 'Unknown',
    block: item.block || '',
    zone: item.zone || '',
    scheduleStartDate: item.scheduleStartDate || item.schedule_start_date || item.createdAt,
    wayleaveNumber: item.wayleaveNumber || item.wayleave_number || '',
    accountNumber: item.accountNumber || item.account_number || '',
    referenceNumber: item.referenceNumber || item.reference_number || '',
    plotNumber: normalizePlot(item.plotNumber),
    requireUSP: item.requireUSP ?? item.require_usp ?? false,
    createdAt: item.createdAt || item.created_at,
  }));
};

export const addRecord = async (record: RecordItem): Promise<RecordItem | null> => {
  const payload = prunePayload({ ...record });
  delete payload.id;
  if (payload.plotNumber) payload.plotNumber = normalizePlot(payload.plotNumber);

  const { data, error } = await supabase
    .from('records')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Error adding record:', error);
    return null;
  }
  return data;
};

export const updateRecord = async (id: string, updates: Partial<RecordItem>): Promise<boolean> => {
  const payload = prunePayload({ ...updates });
  if (payload.plotNumber) payload.plotNumber = normalizePlot(payload.plotNumber);

  const { error } = await supabase
    .from('records')
    .update(payload)
    .eq('id', id);

  if (error) {
    console.error('Error updating record:', error);
    return false;
  }
  return true;
};

export const deleteRecord = async (id: string): Promise<boolean> => {
  const { error } = await supabase
    .from('records')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting record:', error);
    return false;
  }
  return true;
};

/**
 * Enhanced strict validation for payment markers.
 * Specifically handles empty placeholders and garbage characters.
 */
const isValidPaymentMarker = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toLowerCase();
  const emptyPlaceholders = [
    '', 'null', 'undefined', '-', '0', '0.0', 'n/a', 'none', 'no', 'false', '.', '..', '...', '00', '00.00'
  ];
  if (emptyPlaceholders.includes(s)) return false;
  // If it's a date or a string longer than 2 characters and not a placeholder, we count it.
  return s.length > 1;
};

export const getInfraHookData = async (plotNumbers: string[]): Promise<Record<string, { appNo: string, isPaid: boolean }>> => {
  const validPlots = [...new Set(plotNumbers.map(p => normalizePlot(p)).filter(p => p !== ''))];
  if (validPlots.length === 0) return {};

  const hookData: Record<string, { appNo: string, isPaid: boolean }> = {};
  const chunkSize = 200;

  for (let i = 0; i < validPlots.length; i += chunkSize) {
    const chunk = validPlots.slice(i, i + chunkSize);
    
    const { data, error } = await supabase
      .from('infra_references')
      .select('plotNumber, applicationNumber, initialPaymentDate, secondPayment, thirdPayment')
      .in('plotNumber', chunk);

    if (error) {
      console.error('Error checking infra plots:', error);
      continue;
    }

    if (data) {
      data.forEach((row: any) => {
        const hasPaymentData = 
          isValidPaymentMarker(row.initialPaymentDate) || 
          isValidPaymentMarker(row.secondPayment) || 
          isValidPaymentMarker(row.thirdPayment);

        hookData[normalizePlot(row.plotNumber)] = {
          appNo: row.applicationNumber || 'REF MISSING',
          isPaid: !!hasPaymentData
        };
      });
    }
  }

  return hookData;
};

export const searchInfraReferences = async (plotNumber: string): Promise<InfraReferenceItem[]> => {
  if (!plotNumber) return [];
  const term = normalizePlot(plotNumber);

  const { data, error } = await supabase
    .from('infra_references')
    .select('*')
    .ilike('plotNumber', `%${term}%`)
    .limit(20);

  if (error) {
    console.error('Error searching infra references:', error);
    return [];
  }
  return data || [];
};

/**
 * Checks for existing infra plots to avoid duplicates.
 */
export const getExistingInfraPlots = async (plots: string[]): Promise<Set<string>> => {
  if (plots.length === 0) return new Set();
  const existing = new Set<string>();
  const CHUNK = 200;
  for (let i = 0; i < plots.length; i += CHUNK) {
    const chunk = plots.slice(i, i + CHUNK);
    const { data } = await supabase
      .from('infra_references')
      .select('plotNumber')
      .in('plotNumber', chunk);
    data?.forEach(row => existing.add(normalizePlot(row.plotNumber)));
  }
  return existing;
};

export const saveInfraReferences = async (items: Partial<InfraReferenceItem>[]): Promise<boolean> => {
  if (items.length === 0) return true;
  const CHUNK_SIZE = 500;
  let hasError = false;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('infra_references')
      .insert(chunk);

    if (error) {
      console.error(`Error saving infra chunk:`, error);
      hasError = true;
      break; 
    }
  }
  return !hasError;
};
