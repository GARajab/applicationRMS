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