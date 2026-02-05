import { GoogleGenAI } from "@google/genai";
import { RecordItem } from "../types";

// Ensure TypeScript recognizes process.env if @types/node is missing
declare var process: {
  env: {
    [key: string]: string | undefined;
  }
};

export const generateDataInsights = async (records: RecordItem[], query?: string): Promise<string> => {
  // Access the key directly as per requirements. 
  // Vite's `define` will replace `process.env.API_KEY` with the actual string literal during build.
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    console.warn("API Key is missing. AI insights will not work.");
    return "API Key is missing. Please configure the environment variable API_KEY in your deployment settings.";
  }

  try {
    // Initialize the client lazily to avoid top-level crashes
    const ai = new GoogleGenAI({ apiKey });
    
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

    return response.text || "No insights generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate insights. Please try again later.";
  }
};

export const generateRecordReport = async (record: RecordItem): Promise<string> => {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    return "API Key is missing. Cannot generate AI report.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Provide a rich context for the report
    const prompt = `
      You are an intelligent AI assistant for the 'Nexus Record Manager' system.
      The user has requested a full status report for a specific project.
      
      Below is the raw data for the project record:
      ${JSON.stringify(record, null, 2)}
      
      Please generate a **Professional Project Status Report**.
      
      The report should be formatted cleanly (you can use Markdown for bolding, lists, etc.) and include the following sections where data is available:
      
      1.  **Executive Summary**: Project Name (${record.label}), Reference Number, and ID.
      2.  **Current Status**: Clearly state the current Status (${record.status}). If the status is 'Suspended' or 'Redesign', emphasize this.
      3.  **Location & Identification**: Block, Zone, Plot Number, and Road/Building details.
      4.  **Timeline**: Application Date, Schedule Start Date, and any other relevant dates.
      5.  **Technical & Financial**: Wayleave No., Account No., Load (${record.momaaLoad}), Fees Status.
      6.  **Remarks / Outstanding Issues**: detailed analysis of any Justification, Error Logs, or missing critical info (like USP requirements).
      
      Tone: Professional, informative, and direct.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "No report generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Failed to generate report due to an API error. Please try again.";
  }
};
