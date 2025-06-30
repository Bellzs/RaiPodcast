import { STORAGE_KEYS } from './constants';
import { AgentConfig, TTSConfig, PodcastSession } from './types';

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
   * 获取TTS配置
   */
  static async getTTSConfigs(): Promise<{ voiceA: TTSConfig; voiceB: TTSConfig }> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.TTS_CONFIGS);
    return result[STORAGE_KEYS.TTS_CONFIGS] || {
      voiceA: { id: 'voiceA', name: '角色A - 男声', curlCommand: '' },
      voiceB: { id: 'voiceB', name: '角色B - 女声', curlCommand: '' }
    };
  }

  /**
   * 保存TTS配置
   */
  static async saveTTSConfigs(configs: { voiceA: TTSConfig; voiceB: TTSConfig }): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.TTS_CONFIGS]: configs
    });
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
   * 获取设置
   */
  static async getSettings(): Promise<any> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return result[STORAGE_KEYS.SETTINGS] || {};
  }

  /**
   * 保存设置
   */
  static async saveSettings(settings: any): Promise<void> {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: settings
    });
  }

  /**
   * 清空所有数据
   */
  static async clearAll(): Promise<void> {
    await chrome.storage.local.clear();
  }
}