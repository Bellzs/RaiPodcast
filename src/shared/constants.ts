import { AgentConfig, TTSConfig } from './types';

// 存储键名
export const STORAGE_KEYS = {
  AGENT_CONFIGS: 'agent_configs',
  TTS_CONFIGS: 'tts_configs',
  PODCAST_SESSIONS: 'podcast_sessions',
  SETTINGS: 'settings'
} as const;

// 消息类型
export const MESSAGE_TYPES = {
  EXTRACT_CONTENT: 'EXTRACT_CONTENT',
  GENERATE_PODCAST: 'GENERATE_PODCAST',
  GET_AUDIO: 'GET_AUDIO', // 统一的音频获取接口
  GET_CURRENT_SESSION: 'GET_CURRENT_SESSION', // 获取当前会话状态
  AUDIO_READY: 'AUDIO_READY', // 保留用于通知
  TTS_ERROR: 'TTS_ERROR', // TTS错误通知
  PLAY_AUDIO: 'PLAY_AUDIO',
  PAUSE_AUDIO: 'PAUSE_AUDIO',
  STOP_AUDIO: 'STOP_AUDIO'
} as const;

// 默认配置
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  id: 'default',
  name: '默认AI模型',
  apiUrl: '',
  apiKey: '',
  model: '',
  systemPrompt: '你是播客栏目的专家，负责编写播客的对话内容，需要将用户提交的文章内容转换为生动有趣的双人对话。角色A是主持人，角色B是嘉宾。对话要自然流畅，有问有答，能够帮助听众更好地理解文章内容。请直接返回Json数组格式，数组中是两个角色依次的对话内容，示例：[{"user":"A","content":"哈喽，各位听众朋友们，大家好..."},"user":"B","content":"是的，这个话题非常有意思..."},"user":"A","content":"你怎么看待这个问题呢..."}]',
  supportsImages: false
};

export const DEFAULT_TTS_CONFIG = {
  id: 'default',
  name: '默认TTS',
  curlCommand: ''
};

export const DEFAULT_SETTINGS = {
  defaultAgentId: 'default',
  voiceAConfigId: 'voiceA_default',
  voiceBConfigId: 'voiceB_default'
};

export const DEFAULT_VOICE_A_CONFIG = {
  id: 'voiceA_default',
  name: '角色A - 男声（默认）',
  curlCommand: ''
};

export const DEFAULT_VOICE_B_CONFIG = {
  id: 'voiceB_default',
  name: '角色B - 女声（默认）',
  curlCommand: ''
};

// UI常量
export const UI_CONSTANTS = {
  POPUP_WIDTH: 320,
  POPUP_HEIGHT: 600,
  MAX_CONTENT_LENGTH: 10000,
  MAX_AUDIO_CACHE_SIZE: 500 * 1024 * 1024 // 500MB
} as const;