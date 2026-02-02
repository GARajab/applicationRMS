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
    wayleaveNumber: item.wayleaveNumber || item.wayleave_number,
    accountNumber: item.accountNumber || item.account_number,
    referenceNumber: item.referenceNumber || item.reference_number,
    requireUSP: item.requireUSP ?? item.require_usp ?? false,
    sentToUSPDate: item.sentToUSPDate || item.sent_to_usp_date,
    justification: item.justification,
  }));
};

export const addRecord = async (record: RecordItem): Promise<RecordItem | null> => {
  const { data, error } = await supabase
    .from('records')
    .insert([record])
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

export const seedInitialData = async (): Promise<RecordItem[]> => {
  const current = await getRecords();
  if (current.length > 0) return current;

  // New Sequence statuses for seed data
  const statuses = [
    "Assign planning",
    "Site Visit",
    "Design",
    "Design approval",
    "GIS digitalization",
    "Wayleave",
    "Cost estimation",
    "Attach Utilities Drawing",
    "Engineer approval",
    "Redesign",
    "Suspended by EDD",
    "Work Design"
  ];

  // Generate mock data matching the new specific schema
  const mockData: RecordItem[] = Array.from({ length: 15 }).map((_, i) => {
    const requireUSP = i % 3 === 0; // Every 3rd record requires USP
    
    // Distribute statuses across the lifecycle
    const status = statuses[i % statuses.length];

    return {
      id: crypto.randomUUID(),
      label: `Project - ${['Alpha', 'Beta', 'Gamma', 'Delta'][i % 4]} - ${i + 1}`,
      status: status,
      block: `B-${10 + (i % 5)}`,
      zone: `Z-${['North', 'South', 'East', 'West'][i % 4]}`,
      scheduleStartDate: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
      wayleaveNumber: `WL-${2024000 + i}`,
      accountNumber: `ACC-${9000 + i}`,
      referenceNumber: `REF-${1000 + i}`,
      requireUSP: requireUSP,
      sentToUSPDate: requireUSP && i % 2 === 0 ? new Date(Date.now() - (i * 48 * 60 * 60 * 1000)).toISOString() : undefined,
      justification: status === 'Suspended by EDD' ? 'Pending clarification on zoning laws.' : undefined,
      createdAt: new Date().toISOString()
    };
  });

  const { data, error } = await supabase.from('records').insert(mockData).select();
  
  if (error) {
    console.error("Failed to seed Supabase:", error);
    return [];
  }
  return data || [];
};