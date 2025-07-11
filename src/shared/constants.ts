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
  systemPrompt: '# 角色\n你是播客栏目的专家，负责编写播客的对话内容，需要将用户提交的文章内容转换为生动有趣的双人对话。角色A称为“主持人”，负责引入播客主题以及向嘉宾提问，角色B称为“嘉宾”，负责回答主持人的问题。\n# 要求\n仅基于文章内容里包含的信息进行改编，形成自然流畅的对话内容，有问有答，能够帮助听众更好地理解文章内容，不要涉及文章内容里未提及的内容。每位角色的每次说话内容不超过150字。\n# 返回内容\n请直接返回JSON数组格式，以[开头，以]结尾，不得以其它字符开头结尾。\n数组中是两个角色依次的对话内容，严格参照以下 JSON 示例格式：[{"user":"A","content":"哈喽，各位听众朋友们，大家好..."},{"user":"B","content":"是的，这个话题非常有意思..."},{"user":"A","content":"你怎么看待这个问题呢..."}]。',
  supportsImages: false,
  maxImageCount: 10
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