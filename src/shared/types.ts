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

// 音频请求和响应类型
export interface AudioRequest {
  sessionId: string;
  index: number; // 音频段索引
  direction?: 'current' | 'next' | 'previous'; // 请求方向
}

export interface AudioResponse {
  success: boolean;
  audioUrl?: string;
  index?: number;
  totalCount?: number;
  error?: string;
}

export interface GetAudioMessage extends ChromeMessage {
  type: 'GET_AUDIO';
  data: AudioRequest;
}