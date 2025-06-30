// 基础类型定义
export interface PageContent {
  title: string;
  content: string;
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