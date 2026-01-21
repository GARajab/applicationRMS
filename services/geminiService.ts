import { GoogleGenAI } from "@google/genai";
import { RecordItem } from "../types";

// Safe access to process.env to prevent "process is not defined" crashes in browser
const getEnvVar = (key: string) => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return '';
};

const apiKey = getEnvVar('API_KEY') || ''; 
const ai = new GoogleGenAI({ apiKey });

export const generateDataInsights = async (records: RecordItem[], query?: string): Promise<string> => {
  if (!apiKey) {
    return "API Key is missing. Please configure the environment variable.";
  }

  try {
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