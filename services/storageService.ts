import { supabase } from './supabaseClient';
import { RecordItem } from '../types';

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
    // Ensure casing matches interface and handle potential DB snake_case mappings
    scheduleStartDate: item.scheduleStartDate || item.schedule_start_date || item.createdAt,
    wayleaveNumber: item.wayleaveNumber || item.wayleave_number || '',
    accountNumber: item.accountNumber || item.account_number || '',
    referenceNumber: item.referenceNumber || item.reference_number || '',
    requireUSP: item.requireUSP ?? item.require_usp ?? false,
    sentToUSPDate: item.sentToUSPDate || item.sent_to_usp_date,
    justification: item.justification || '',
    status: item.status || 'Unknown', // Default fallback
    label: item.label || 'Untitled', // Default fallback
    block: item.block || '',
    zone: item.zone || '',
  }));
};

export const addRecord = async (record: RecordItem): Promise<RecordItem | null> => {
  // Create a copy and remove 'id' if it is empty so Supabase generates a valid UUID
  const payload: any = { ...record };
  if (!payload.id || payload.id === '') {
    delete payload.id;
  }

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
  const { error } = await supabase
    .from('records')
    .update(updates)
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