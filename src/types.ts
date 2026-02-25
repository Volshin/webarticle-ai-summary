export interface SummaryResult {
  ultraShort: string;   // 2-3 sentences
  short: string;        // 1 paragraph
  medium: string;       // 3-4 paragraphs
  detailed: string;     // comprehensive summary
  fluffPercentage: number;  // 0-100
  noveltyScore: number;     // 0-100
}

export type DetailLevel = 0 | 1 | 2 | 3;

export const LEVEL_KEYS: (keyof SummaryResult)[] = [
  'ultraShort',
  'short',
  'medium',
  'detailed',
];

export const LEVEL_LABELS = ['Brief', 'Short', 'Medium', 'Detailed'];

export type MessageType =
  | 'ANALYZE_PAGE'
  | 'ANALYSIS_RESULT'
  | 'EXTRACT_TEXT'
  | 'TEXT_EXTRACTED'
  | 'SET_API_KEY'
  | 'GET_API_KEY'
  | 'API_KEY_RESULT';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

export interface AnalysisResponse {
  success: true;
  data: SummaryResult;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type BackgroundResponse = AnalysisResponse | ErrorResponse;
