
import { supabase } from './supabaseClient';
import { RecordItem, InfraReferenceItem } from '../types';

// Helper to normalize plot numbers for consistent matching
const normalizePlot = (p: string | number | null | undefined): string => {
  if (!p) return '';
  return String(p).trim();
};

/**
 * List of columns guaranteed to exist in the standard database schema.
 * Sending columns not in this list causes Supabase 400 Bad Request (PGRST204).
 */
const SAFE_COLUMNS = [
  'label', 'status', 'block', 'zone', 'scheduleStartDate', 
  'wayleaveNumber', 'accountNumber', 'referenceNumber', 
  'requireUSP', 'sentToUSPDate', 'justification', 'createdAt',
  'plotNumber', 'applicationNumber', 'momaaLoad', 'subtype'
];

/**
 * Prunes keys from an object that are not in the safe columns list
 * or are empty/null values.
 */
const prunePayload = (obj: any) => {
  const pruned: any = {};
  Object.keys(obj).forEach(key => {
    const val = obj[key];
    // Check if key is in our safe list and has a meaningful value
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
    plotNumber: normalizePlot(item.plotNumber || item.plot_number),
    requireUSP: item.requireUSP ?? item.require_usp ?? false,
    createdAt: item.createdAt || item.created_at,
  }));
};

export const addRecord = async (record: RecordItem): Promise<RecordItem | null> => {
  const payload = prunePayload({ ...record });
  
  // Never send ID for new records
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

export const getPaidPlotNumbers = async (plotNumbers: string[]): Promise<Set<string>> => {
  const validPlots = [...new Set(plotNumbers.map(p => normalizePlot(p)).filter(p => p !== ''))];
  if (validPlots.length === 0) return new Set();

  const paidPlots = new Set<string>();
  const chunkSize = 200;

  for (let i = 0; i < validPlots.length; i += chunkSize) {
    const chunk = validPlots.slice(i, i + chunkSize);
    
    const { data, error } = await supabase
      .from('infra_references')
      .select('plotNumber, initialPaymentDate, secondPayment, thirdPayment')
      .in('plotNumber', chunk);

    if (error) {
      console.error('Error checking infra plots:', error);
      continue;
    }

    if (data) {
      data.forEach((row: any) => {
        const hasPaymentData = 
          (row.initialPaymentDate && String(row.initialPaymentDate).trim() !== '') || 
          (row.secondPayment && String(row.secondPayment).trim() !== '') || 
          (row.thirdPayment && String(row.thirdPayment).trim() !== '');

        if (row.plotNumber && hasPaymentData) {
          paidPlots.add(normalizePlot(row.plotNumber));
        }
      });
    }
  }

  return paidPlots;
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
      console.error(`Error saving chunk ${i}:`, error);
      hasError = true;
      break; 
    }
  }
  return !hasError;
};
