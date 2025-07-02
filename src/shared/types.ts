// 基础类型定义
export interface PageImage {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface PageContent {
  title: string;
  content: string;
  images: PageImage[];
  url: string;
  timestamp: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  supportsImages: boolean;
}

export interface TTSConfig {
  id: string;
  name: string;
  curlCommand: string;
}

export interface AppSettings {
  defaultAgentId: string;
  voiceAConfigId: string;
  voiceBConfigId: string;
}

export interface DialogueItem {
  speaker: 'A' | 'B';
  text: string;
  timestamp: number;
}

export interface AudioSegment {
  id: string;
  audioUrl: string;
  duration: number;
  speaker: 'A' | 'B';
}

export interface PodcastSession {
  id: string;
  title: string;
  content: PageContent;
  dialogue: DialogueItem[];
  audioSegments: AudioSegment[];
  createdAt: number;
  status: 'generating' | 'ready' | 'error';
}

// Chrome扩展消息类型
export interface ChromeMessage {
  type: string;
  data?: any;
}

export interface ExtractContentMessage extends ChromeMessage {
  type: 'EXTRACT_CONTENT';
  data?: {
    tabId?: number;
  };
}

export interface GeneratePodcastMessage extends ChromeMessage {
  type: 'GENERATE_PODCAST';
  data: {
    content: PageContent;
    agentConfig: AgentConfig;
    ttsConfigs: {
      voiceA: TTSConfig;
      voiceB: TTSConfig;
    };
  };
}

// 音频状态枚举
export enum AudioStatus {
  NOT_REQUESTED = 'not_requested',    // 未请求
  REQUESTING = 'requesting',          // 正在请求
  GENERATION_ERROR = 'generation_error', // 生成错误
  GENERATION_SUCCESS = 'generation_success' // 生成成功
}

// 音频状态信息
export interface AudioStatusInfo {
  status: AudioStatus;
  audioUrl?: string;           // 音频URL（成功时）
  requestId?: string;          // 请求ID（请求中时）
  errorMessage?: string;       // 错误信息（错误时）
  timestamp: number;           // 状态更新时间
}

// 音频请求和响应类型
export interface AudioRequest {
  sessionId: string;
  index: number; // 音频段索引
  direction?: 'current' | 'next' | 'previous'; // 请求方向
}

export interface AudioResponse {
  success: boolean;
  audioUrl?: string | null; // 允许为null表示音频还未生成完成
  index?: number;
  totalCount?: number;
  error?: string;
  message?: string; // 状态消息，如"音频正在生成中，请稍候"
}

export interface GetAudioMessage extends ChromeMessage {
  type: 'GET_AUDIO';
  data: AudioRequest;
}