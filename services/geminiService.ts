
import { GoogleGenAI } from "@google/genai";
import { RecordItem } from "../types";

// Ensure TypeScript recognizes process.env
declare var process: {
  env: {
    [key: string]: string | undefined;
  }
};

/**
 * Generates data insights from records using Gemini API.
 * Follows @google/genai guidelines for client initialization and response handling.
 */
export const generateDataInsights = async (records: RecordItem[], query?: string): Promise<string> => {
  try {
    // Guideline: Always use const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    const contextData = JSON.stringify(records.slice(0, 50));
    
    const prompt = query 
      ? `Given the following dataset of records (Fields: Label, Status, Block, Zone, ScheduleStartDate, Wayleave, Account, Reference): ${contextData}. Answer this question: ${query}`
      : `Analyze the following dataset. Provide 3 key insights focusing on Status distribution, Zones with most activity, and any scheduling bottlenecks based on ScheduleStartDate. Dataset: ${contextData}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an expert data analyst for a Record Management System. Keep answers concise, professional, and actionable.",
      }
    });

    // Guideline: Use response.text property directly
    return response.text || "No insights generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate insights. Please try again later.";
  }
};

/**
 * Generates a professional report for a record using Gemini API.
 */
export const generateRecordReport = async (record: any): Promise<string> => {
  try {
    // Guideline: Create a new GoogleGenAI instance right before making an API call
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
    
    // Prepare a generic prompt that works for both active Records and Excel/Infra references
    const prompt = `
      You are an intelligent AI assistant for the 'Nexus Record Manager' system.
      The user has requested a full status report for a specific project/plot.
      
      **Data Source**: ${record.plotNumber ? 'Infrastructure Database (Excel)' : 'Active Project Records'}
      
      **Raw Record Data**:
      ${JSON.stringify(record, null, 2)}
      
      Please generate a **Professional Project Status Report**.
      
      The report should be formatted cleanly (use Markdown) and include the following sections if data exists:
      
      1.  **Executive Summary**: 
          - Identification: Plot ${record.plotNumber || 'N/A'}, Application ${record.applicationNumber || 'N/A'}, Reference ${record.referenceNumber || 'N/A'}.
          - Owner: ${record.ownerNameEn || record.label || 'N/A'}.
      
      2.  **Current Status**: 
          - State: ${record.status || record.applicationStatus || 'Unknown'}.
          - Fee Status: ${record.ewaFeeStatus || 'N/A'}.
      
      3.  **Location Details**: 
          - Block ${record.block || record.blockNumber || '-'}, Zone ${record.zone || record.investmentZone || '-'}, Road ${record.roadNumber || '-'}, Building ${record.buildingNumber || '-'}.
      
      4.  **Financial & Payments**:
          - **Critical**: Check for 'Initial Payment Date', 'Second Payment', 'Third Payment'. 
          - If dates exist, list them clearly. If they are missing/null, explicitly state "No Payment History Found".
          - 13/2006 CC Status (if derived from calculation logic context, otherwise omit).
      
      5.  **Technical Details**:
          - Load: ${record.momaaLoad || 'N/A'}.
          - Wayleave: ${record.wayleaveNumber || 'N/A'}.
          - Account: ${record.accountNumber || 'N/A'}.
      
      6.  **Remarks**: 
          - Analyze 'Error log', 'Justification', or 'Notes' if present.
      
      Tone: Professional, informative, and direct.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Guideline: Use response.text property directly
    return response.text || "No report generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate report due to an API error. Please try again.";
  }
};
