import { supabase } from './supabaseClient';
import { RecordItem, InfraReferenceItem } from '../types';

// Helper to normalize plot numbers for consistent matching
const normalizePlot = (p: string | number | null | undefined): string => {
  if (!p) return '';
  return String(p).trim();
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
    // Core fields
    id: item.id,
    label: item.label || 'Untitled',
    status: item.status || 'Unknown',
    block: item.block || '',
    zone: item.zone || '',
    scheduleStartDate: item.scheduleStartDate || item.schedule_start_date || item.createdAt,
    wayleaveNumber: item.wayleaveNumber || item.wayleave_number || '',
    accountNumber: item.accountNumber || item.account_number || '',
    referenceNumber: item.referenceNumber || item.reference_number || '',
    
    // New Dashboard Fields
    subtype: item.subtype,
    type: item.type,
    phase: item.phase,
    scheduleEndDate: item.scheduleEndDate || item.schedule_end_date,
    userConnected: item.userConnected || item.user_connected,
    createdBy: item.createdBy || item.created_by,
    capitalContribution: item.capitalContribution || item.capital_contribution,
    nominatedContractor: item.nominatedContractor || item.nominated_contractor,
    urgent: item.urgent,
    lastShutdown: item.lastShutdown || item.last_shutdown,
    planningEngineer: item.planningEngineer || item.planning_engineer,
    constructionEngineer: item.constructionEngineer || item.construction_engineer,
    supervisor: item.supervisor,
    plannedTotalCost: item.plannedTotalCost || item.planned_total_cost,
    plannedMaterialCost: item.plannedMaterialCost || item.planned_material_cost,
    plannedServiceCost: item.plannedServiceCost || item.planned_service_cost,
    paymentDate: item.paymentDate || item.payment_date,
    totalPower: item.totalPower || item.total_power,
    contractorAssignDate: item.contractorAssignDate || item.contractor_assign_date,
    workOrder: item.workOrder || item.work_order,
    plotNumber: normalizePlot(item.plotNumber || item.plot_number), // Normalize here
    customerCpr: item.customerCpr || item.customer_cpr,
    jobType: item.jobType || item.job_type,
    governorate: item.governorate,
    nasCode: item.nasCode || item.nas_code,
    description: item.description,
    mtcContractor: item.mtcContractor || item.mtc_contractor,
    workflowEntryDate: item.workflowEntryDate || item.workflow_entry_date,
    contractorPaymentDate: item.contractorPaymentDate || item.contractor_payment_date,
    installationContractor: item.installationContractor || item.installation_contractor,

    // Existing / internal
    requireUSP: item.requireUSP ?? item.require_usp ?? false,
    sentToUSPDate: item.sentToUSPDate || item.sent_to_usp_date,
    justification: item.justification || '',
    
    // Extra fields
    applicationNumber: item.applicationNumber || item.application_number,
    momaaLoad: item.momaaLoad || item.momaa_load,
  }));
};

export const addRecord = async (record: RecordItem): Promise<RecordItem | null> => {
  const payload: any = { ...record };
  if (!payload.id || payload.id === '') {
    delete payload.id;
  }
  // Normalize plot on save
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
  const payload = { ...updates };
  // Normalize plot on update
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

// --- Infra References Methods ---

// RE-ENGINEERED: Checks for ACTUAL PAYMENT DATES in addition to plot existence
export const getPaidPlotNumbers = async (plotNumbers: string[]): Promise<Set<string>> => {
  // Normalize inputs
  const validPlots = [...new Set(plotNumbers.map(p => normalizePlot(p)).filter(p => p !== ''))];
  if (validPlots.length === 0) return new Set();

  const paidPlots = new Set<string>();
  const chunkSize = 200;

  for (let i = 0; i < validPlots.length; i += chunkSize) {
    const chunk = validPlots.slice(i, i + chunkSize);
    
    // Select payment fields to check if they have values
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
        // A plot is "YES" (Red) only if it has at least one payment date recorded
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

  // Search in database directly using ILIKE
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

  // Process in chunks
  let hasError = false;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    
    // Clean data before insert
    const cleanChunk = chunk.map(item => {
       const clean: any = { ...item };
       // CRITICAL: Normalize plot number for consistent matching
       if (clean.plotNumber) clean.plotNumber = normalizePlot(clean.plotNumber);
       return clean;
    });

    const { error } = await supabase
      .from('infra_references')
      .insert(cleanChunk);

    if (error) {
      console.error(`Error saving chunk ${i} to ${i + CHUNK_SIZE}:`, error);
      hasError = true;
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