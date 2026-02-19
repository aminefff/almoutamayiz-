
import { GoogleGenAI } from "@google/genai";

/**
 * تهيئة عميل Gemini.
 * يجب استخدام process.env.API_KEY حصراً كما هو محدد في التعليمات.
 */
export const initGemini = () => {
  // استخدام التعيين المباشر كما هو مطلوب في القواعد
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * معالج أخطاء ذكي يعيد رسائل مفهومة للمستخدم.
 */
export const formatGeminiError = (error: any): string => {
  console.error("System Error Log:", error);
  if (!error) return "حدث خطأ غير متوقع، يرجى المحاولة.";
  const message = (error.message || error.toString()).toLowerCase();

  if (message.includes('429') || message.includes('resource_exhausted')) {
    return "⚠️ هناك ضغط عالٍ على الخوادم حالياً. يرجى الانتظار دقيقة واحدة ثم إعادة المحاولة.";
  }
  if (message.includes('400')) {
    return "تعذر معالجة هذا المحتوى. حاول صياغته بشكل مختلف.";
  }
  return "حدث خطأ أثناء المعالجة، يرجى إعادة المحاولة.";
};
