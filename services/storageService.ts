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
    scheduleStartDate: item.scheduleStartDate || item.schedule_start_date || item.createdAt,
    wayleaveNumber: item.wayleaveNumber || item.wayleave_number || '',
    accountNumber: item.accountNumber || item.account_number || '',
    referenceNumber: item.referenceNumber || item.reference_number || '',
    requireUSP: item.requireUSP ?? item.require_usp ?? false,
    sentToUSPDate: item.sentToUSPDate || item.sent_to_usp_date,
    justification: item.justification || '',
    status: item.status || 'Unknown',
    label: item.label || 'Untitled',
    block: item.block || '',
    zone: item.zone || '',
    
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

// Batch check for payment status
export const getPaidPlotNumbers = async (plotNumbers: string[]): Promise<Set<string>> => {
  // Filter out empty/null
  const validPlots = [...new Set(plotNumbers.filter(p => p && p.trim() !== ''))];
  if (validPlots.length === 0) return new Set();

  const paidPlots = new Set<string>();
  const chunkSize = 200; // avoid URL too long errors

  for (let i = 0; i < validPlots.length; i += chunkSize) {
    const chunk = validPlots.slice(i, i + chunkSize);
    
    // We check if row exists with plotNumber match AND has at least one payment date field populated
    const { data, error } = await supabase
      .from('infra_references')
      .select('plotNumber, initialPaymentDate, secondPayment, thirdPayment')
      .in('plotNumber', chunk);

    if (error) {
      console.error('Error checking paid plots:', error);
      continue;
    }

    if (data) {
      data.forEach((row: any) => {
        // Consider it paid if any payment date field is truthy
        if (row.initialPaymentDate || row.secondPayment || row.thirdPayment) {
          paidPlots.add(row.plotNumber);
        }
      });
    }
  }

  return paidPlots;
};

// Changed to search ONLY when requested to handle large datasets
export const searchInfraReferences = async (plotNumber: string): Promise<InfraReferenceItem[]> => {
  if (!plotNumber) return [];

  // Search in database directly using ILIKE (case-insensitive)
  const { data, error } = await supabase
    .from('infra_references')
    .select('*')
    .ilike('plotNumber', `%${plotNumber.trim()}%`)
    .limit(20); // Limit results to prevent UI lag

  if (error) {
    console.error('Error searching infra references:', error);
    return [];
  }
  return data || [];
};

// Helper to check DB count
export const getInfraStats = async (): Promise<{ count: number }> => {
  const { count, error } = await supabase
    .from('infra_references')
    .select('*', { count: 'exact', head: true });
    
  if (error) return { count: 0 };
  return { count: count || 0 };
};

const CHUNK_SIZE = 1000;

export const saveInfraReferences = async (items: Partial<InfraReferenceItem>[]): Promise<boolean> => {
  if (items.length === 0) return true;

  // Process in chunks to handle 27k+ records
  let hasError = false;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    
    // Clean data before insert (ensure no undefined/null where text is expected if strict mode is on)
    const cleanChunk = chunk.map(item => {
       const clean: any = { ...item };
       // Ensure plotNumber is a string
       if (clean.plotNumber) clean.plotNumber = String(clean.plotNumber);
       return clean;
    });

    const { error } = await supabase
      .from('infra_references')
      .insert(cleanChunk);

    if (error) {
      console.error(`Error saving chunk ${i} to ${i + CHUNK_SIZE}:`, error);
      hasError = true;
      // Depending on requirement, we might want to continue or stop. 
      // Stopping is safer to prevent partial data states that are hard to fix.
      break; 
    }
  }

  return !hasError;
};

export const clearInfraReferences = async (): Promise<boolean> => {
  const { error } = await supabase
    .from('infra_references')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); 

  if (error) {
    console.error('Error clearing infra references:', error);
    return false;
  }
  return true;
};
