import { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_VOICE_A_CONFIG, DEFAULT_VOICE_B_CONFIG } from './constants';
import { AgentConfig, TTSConfig, PodcastSession, AppSettings } from './types';

/**
 * Chrome存储管理类
 */
export class StorageManager {
  /**
   * 获取Agent配置列表
   */
  static async getAgentConfigs(): Promise<AgentConfig[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AGENT_CONFIGS);
    return result[STORAGE_KEYS.AGENT_CONFIGS] || [];
  }

  /**
   * 保存Agent配置列表
   */
  static async saveAgentConfigs(configs: AgentConfig[]): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.AGENT_CONFIGS]: configs
    });
  }

  /**
   * 添加Agent配置
   */
  static async addAgentConfig(config: AgentConfig): Promise<void> {
    const configs = await this.getAgentConfigs();
    configs.push(config);
    await this.saveAgentConfigs(configs);
  }

  /**
   * 删除Agent配置
   */
  static async deleteAgentConfig(configId: string): Promise<void> {
    const configs = await this.getAgentConfigs();
    const filteredConfigs = configs.filter(c => c.id !== configId);
    await this.saveAgentConfigs(filteredConfigs);
  }

  /**
   * 更新Agent配置
   */
  static async updateAgentConfig(config: AgentConfig): Promise<void> {
    const configs = await this.getAgentConfigs();
    const index = configs.findIndex(c => c.id === config.id);
    if (index >= 0) {
      configs[index] = config;
      await this.saveAgentConfigs(configs);
    }
  }

  /**
   * 获取TTS配置列表
   */
  static async getTTSConfigs(): Promise<TTSConfig[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.TTS_CONFIGS);
    return result[STORAGE_KEYS.TTS_CONFIGS] || [DEFAULT_VOICE_A_CONFIG, DEFAULT_VOICE_B_CONFIG];
  }

  /**
   * 保存TTS配置列表
   */
  static async saveTTSConfigs(configs: TTSConfig[]): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.TTS_CONFIGS]: configs
    });
  }

  /**
   * 添加TTS配置
   */
  static async addTTSConfig(config: TTSConfig): Promise<void> {
    const configs = await this.getTTSConfigs();
    configs.push(config);
    await this.saveTTSConfigs(configs);
  }

  /**
   * 删除TTS配置
   */
  static async deleteTTSConfig(configId: string): Promise<void> {
    const configs = await this.getTTSConfigs();
    const filteredConfigs = configs.filter(c => c.id !== configId);
    await this.saveTTSConfigs(filteredConfigs);
  }

  /**
   * 更新TTS配置
   */
  static async updateTTSConfig(config: TTSConfig): Promise<void> {
    const configs = await this.getTTSConfigs();
    const index = configs.findIndex(c => c.id === config.id);
    if (index >= 0) {
      configs[index] = config;
      await this.saveTTSConfigs(configs);
    }
  }

  /**
   * 获取播客会话列表
   */
  static async getPodcastSessions(): Promise<PodcastSession[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PODCAST_SESSIONS);
    return result[STORAGE_KEYS.PODCAST_SESSIONS] || [];
  }

  /**
   * 保存播客会话
   */
  static async savePodcastSession(session: PodcastSession): Promise<void> {
    const sessions = await this.getPodcastSessions();
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.unshift(session);
    }
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.PODCAST_SESSIONS]: sessions
    });
  }

  /**
   * 删除播客会话
   */
  static async deletePodcastSession(sessionId: string): Promise<void> {
    const sessions = await this.getPodcastSessions();
    const filteredSessions = sessions.filter(s => s.id !== sessionId);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.PODCAST_SESSIONS]: filteredSessions
    });
  }

  /**
   * 获取应用设置
   */
  static async getAppSettings(): Promise<AppSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
  }

  /**
   * 保存应用设置
   */
  static async saveAppSettings(settings: AppSettings): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: settings
    });
  }

  /**
   * 获取当前选中的Agent配置
   */
  static async getCurrentAgentConfig(): Promise<AgentConfig | null> {
    const settings = await this.getAppSettings();
    const configs = await this.getAgentConfigs();
    return configs.find(c => c.id === settings.defaultAgentId) || null;
  }

  /**
   * 获取当前选中的TTS配置
   */
  static async getCurrentTTSConfigs(): Promise<{ voiceA: TTSConfig | null; voiceB: TTSConfig | null }> {
    const settings = await this.getAppSettings();
    const configs = await this.getTTSConfigs();
    return {
      voiceA: configs.find(c => c.id === settings.voiceAConfigId) || null,
      voiceB: configs.find(c => c.id === settings.voiceBConfigId) || null
    };
  }

  /**
   * 清空所有数据
   */
  static async clearAll(): Promise<void> {
    await chrome.storage.local.clear();
  }
}