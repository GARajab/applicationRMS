import { supabase } from './supabaseClient';
import { RecordItem, InfraReferenceItem } from '../types';

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
    
    // New fields mapping (if casing differs in future or just for safety)
    applicationNumber: item.applicationNumber || item.application_number,
    bpRequestNumber: item.bpRequestNumber || item.bp_request_number,
    versionNumber: item.versionNumber || item.version_number,
    constructionType: item.constructionType || item.construction_type,
    ewaFeeStatus: item.ewaFeeStatus || item.ewa_fee_status,
    applicationStatus: item.applicationStatus || item.application_status,
    landOwnerId: item.landOwnerId || item.land_owner_id,
    ownerNameEn: item.ownerNameEn || item.owner_name_en,
    ownerNameAr: item.ownerNameAr || item.owner_name_ar,
    numberOfAddresses: item.numberOfAddresses || item.number_of_addresses,
    mouGatedCommunity: item.mouGatedCommunity || item.mou_gated_community,
    buildingNumber: item.buildingNumber || item.building_number,
    roadNumber: item.roadNumber || item.road_number,
    plotNumber: item.plotNumber || item.plot_number,
    titleDeed: item.titleDeed || item.title_deed,
    buildableArea: item.buildableArea || item.buildable_area,
    momaaLoad: item.momaaLoad || item.momaa_load,
    applicationDate: item.applicationDate || item.application_date,
    nationality: item.nationality,
    propertyCategory: item.propertyCategory || item.property_category,
    usageNature: item.usageNature || item.usage_nature,
    investmentZone: item.investmentZone || item.investment_zone,
    initialPaymentDate: item.initialPaymentDate || item.initial_payment_date,
    secondPayment: item.secondPayment || item.second_payment,
    thirdPayment: item.thirdPayment || item.third_payment,
    errorLog: item.errorLog || item.error_log,
    partialExemption: item.partialExemption || item.partial_exemption
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

// --- Infra References Methods ---

export const getInfraReferences = async (): Promise<InfraReferenceItem[]> => {
  const { data, error } = await supabase
    .from('infra_references')
    .select('*')
    .order('createdAt', { ascending: false });

  if (error) {
    console.error('Error fetching infra references:', error);
    return [];
  }
  return data || [];
};

export const saveInfraReferences = async (items: { plotNumber: string, details: any }[]): Promise<boolean> => {
  if (items.length === 0) return true;

  // Supabase can handle bulk inserts. 
  // However, large batches might fail. Chunking could be added if needed, 
  // but for typical excel sheets (rows < 5000) it should be okay.
  const { error } = await supabase
    .from('infra_references')
    .insert(items);

  if (error) {
    console.error('Error saving infra references:', error);
    return false;
  }
  return true;
};

export const clearInfraReferences = async (): Promise<boolean> => {
  const { error } = await supabase
    .from('infra_references')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Deletes all rows

  if (error) {
    console.error('Error clearing infra references:', error);
    return false;
  }
  return true;
};