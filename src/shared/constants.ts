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
  PLAY_AUDIO: 'PLAY_AUDIO',
  PAUSE_AUDIO: 'PAUSE_AUDIO',
  STOP_AUDIO: 'STOP_AUDIO'
} as const;

// 默认配置
export const DEFAULT_AGENT_CONFIG = {
  id: 'default',
  name: '默认AI模型',
  apiUrl: '',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  systemPrompt: '你是两个专业的播客主持人，需要将给定的文章内容转换为生动有趣的双人对话。角色A是主持人，角色B是嘉宾。对话要自然流畅，有问有答，能够帮助听众更好地理解文章内容。',
  temperature: 0.7,
  maxTokens: 2000
};

export const DEFAULT_TTS_CONFIG = {
  id: 'default',
  name: '默认TTS',
  curlCommand: ''
};

// UI常量
export const UI_CONSTANTS = {
  POPUP_WIDTH: 320,
  POPUP_HEIGHT: 600,
  MAX_CONTENT_LENGTH: 10000,
  MAX_AUDIO_CACHE_SIZE: 500 * 1024 * 1024 // 500MB
} as const;