import { ChromeMessage, ExtractContentMessage, GeneratePodcastMessage } from '@/shared/types';
import { MESSAGE_TYPES } from '@/shared/constants';
import { AudioRequest, AudioResponse, PodcastSession, AudioStatus, AudioStatusInfo } from '@/shared/types';

/**
 * 音频会话管理器
 * 负责统一管理音频的获取、缓存和预加载
 */
class AudioSessionManager {
  private audioStatusMap = new Map<string, AudioStatusInfo>(); // sessionId:index -> AudioStatusInfo
  private sessionData = new Map<string, PodcastSession>();
  private ttsConfigs = new Map<string, any>(); // sessionId -> ttsConfigs
  private notifyAudioReadyCallback?: (sessionId: string, index: number, audioUrl: string) => void;
  private notifyErrorCallback?: (sessionId: string, index: number, errorMessage: string) => void;

  /**
   * 获取音频
   */
  async getAudio(request: AudioRequest): Promise<AudioResponse> {
    const { sessionId, index, direction = 'current' } = request;
    const statusKey = `${sessionId}:${index}`;
    
    console.log(`[AudioSessionManager] 收到音频请求: ${statusKey}, direction: ${direction}`);
    
    // 获取当前音频状态
    const currentStatus = this.getAudioStatus(sessionId, index);
    
    switch (currentStatus.status) {
      case AudioStatus.GENERATION_SUCCESS:
        console.log(`[AudioSessionManager] 从缓存返回音频: ${statusKey}`);
        return {
          success: true,
          audioUrl: currentStatus.audioUrl!,
          index,
          totalCount: this.getSessionTotalCount(sessionId)
        };
        
      case AudioStatus.REQUESTING:
        console.log(`[AudioSessionManager] 音频正在生成中: ${statusKey}`);
        return {
          success: true,
          audioUrl: null, // 音频还未生成完成
          index,
          totalCount: this.getSessionTotalCount(sessionId),
          message: '音频正在生成中，请稍候'
        };
        
      case AudioStatus.GENERATION_ERROR:
        console.log(`[AudioSessionManager] 音频之前生成失败，重新尝试: ${statusKey}`);
        // 重新尝试生成
        return await this.startAudioGeneration(sessionId, index, direction);
        
      case AudioStatus.NOT_REQUESTED:
      default:
        console.log(`[AudioSessionManager] 开始新的音频生成: ${statusKey}`);
        return await this.startAudioGeneration(sessionId, index, direction);
    }
  }

  /**
   * 获取音频状态
   */
  private getAudioStatus(sessionId: string, index: number): AudioStatusInfo {
    const statusKey = `${sessionId}:${index}`;
    return this.audioStatusMap.get(statusKey) || {
      status: AudioStatus.NOT_REQUESTED,
      timestamp: Date.now()
    };
  }

  /**
   * 设置音频状态
   */
  private setAudioStatus(sessionId: string, index: number, statusInfo: Partial<AudioStatusInfo>): void {
    const statusKey = `${sessionId}:${index}`;
    const currentStatus = this.getAudioStatus(sessionId, index);
    const newStatus: AudioStatusInfo = {
      ...currentStatus,
      ...statusInfo,
      timestamp: Date.now()
    };
    this.audioStatusMap.set(statusKey, newStatus);
    console.log(`[AudioSessionManager] 更新音频状态: ${statusKey} -> ${newStatus.status}`);
  }

  /**
   * 开始音频生成
   */
  private async startAudioGeneration(sessionId: string, index: number, direction: string): Promise<AudioResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 设置为请求中状态
    this.setAudioStatus(sessionId, index, {
      status: AudioStatus.REQUESTING,
      requestId
    });
    
    // 异步生成音频
    this.generateAudioAsync(sessionId, index, requestId);
    
    // 预加载下一条音频
    if (direction === 'next' || direction === 'current') {
      this.preloadNextAudio(sessionId, index + 1);
    }
    
    return {
      success: true,
      audioUrl: null, // 音频还未生成完成
      index,
      totalCount: this.getSessionTotalCount(sessionId),
      message: '音频正在生成中，请稍候'
    };
  }

  /**
   * 异步生成音频
   */
  private async generateAudioAsync(sessionId: string, index: number, requestId: string): Promise<void> {
    try {
      console.log(`[AudioSessionManager] 开始异步生成音频: ${sessionId}:${index}, requestId: ${requestId}`);
      
      const audioUrl = await this.generateAudio(sessionId, index);
      
      // 检查请求是否仍然有效（避免重复请求的竞态条件）
      const currentStatus = this.getAudioStatus(sessionId, index);
      if (currentStatus.requestId !== requestId) {
        console.log(`[AudioSessionManager] 请求已过期，忽略结果: ${sessionId}:${index}`);
        return;
      }
      
      // 设置为成功状态
      this.setAudioStatus(sessionId, index, {
        status: AudioStatus.GENERATION_SUCCESS,
        audioUrl,
        requestId: undefined
      });
      
      // 通知前端音频准备就绪
      if (this.notifyAudioReadyCallback) {
        this.notifyAudioReadyCallback(sessionId, index, audioUrl);
      }
      
      console.log(`[AudioSessionManager] 音频生成成功: ${sessionId}:${index}`);
      
    } catch (error) {
      console.error(`[AudioSessionManager] 音频生成失败: ${sessionId}:${index}`, error);
      
      // 检查请求是否仍然有效
      const currentStatus = this.getAudioStatus(sessionId, index);
      if (currentStatus.requestId !== requestId) {
        console.log(`[AudioSessionManager] 请求已过期，忽略错误: ${sessionId}:${index}`);
        return;
      }
      
      // 设置为错误状态
      this.setAudioStatus(sessionId, index, {
        status: AudioStatus.GENERATION_ERROR,
        errorMessage: (error as Error).message,
        requestId: undefined
      });
      
      // 通知前端错误
      if (this.notifyErrorCallback) {
        this.notifyErrorCallback(sessionId, index, (error as Error).message);
      }
    }
  }

  /**
   * 预加载下一条音频
   */
  private async preloadNextAudio(sessionId: string, nextIndex: number): Promise<void> {
    // 检查索引是否有效
    const totalCount = this.getSessionTotalCount(sessionId);
    if (nextIndex >= totalCount) {
      return;
    }
    
    // 检查当前状态
    const currentStatus = this.getAudioStatus(sessionId, nextIndex);
    if (currentStatus.status === AudioStatus.REQUESTING || currentStatus.status === AudioStatus.GENERATION_SUCCESS) {
      console.log(`[AudioSessionManager] 跳过预加载，音频已存在或正在生成: ${sessionId}:${nextIndex}`);
      return;
    }
    
    console.log(`[AudioSessionManager] 开始预加载音频: ${sessionId}:${nextIndex}`);
    
    // 开始预加载（不等待结果）
    this.startAudioGeneration(sessionId, nextIndex, 'preload').catch(error => {
      console.error(`[AudioSessionManager] 预加载失败: ${sessionId}:${nextIndex}`, error);
    });
  }

  /**
   * 生成音频
   */
  private async generateAudio(sessionId: string, index: number): Promise<string> {
    const session = this.sessionData.get(sessionId);
    if (!session) {
      throw new Error(`会话不存在: ${sessionId}`);
    }
    
    if (index >= session.dialogue.length) {
      throw new Error(`音频索引超出范围: ${index}`);
    }
    
    const dialogueItem = session.dialogue[index];
    // 调用TTS生成逻辑，传递sessionId
    return await this.callTTSServiceWithSession(sessionId, dialogueItem.text, dialogueItem.speaker);
  }

  /**
   * 调用TTS服务（带会话ID）
   */
  private async callTTSServiceWithSession(sessionId: string, text: string, speaker: 'A' | 'B'): Promise<string> {
    const ttsConfigs = this.getTTSConfigs(sessionId);
    if (!ttsConfigs) {
      throw new Error('TTS配置不存在');
    }
    
    const voiceConfig = speaker === 'A' ? ttsConfigs.voiceA : ttsConfigs.voiceB;
    if (!voiceConfig) {
      throw new Error(`${speaker}角色的语音配置不存在`);
    }
    
    // 调用原有的TTS生成逻辑
    return await this.callOriginalTTSService(text, voiceConfig);
  }



  /**
   * 调用原有的TTS服务
   */
  private async callOriginalTTSService(text: string, voiceConfig: any): Promise<string> {
    try {
      // 解析cURL命令
      const curlCommand = voiceConfig.curlCommand;
      const urlMatch = curlCommand.match(/curl\s+['"']?([^'"'\s]+)['"']?/);
      if (!urlMatch) {
        throw new Error('无法解析TTS API URL');
      }
      
      let url = urlMatch[1];
      
      // 替换URL中的{text}占位符
      if (url.includes('{text}')) {
        url = url.replace('{text}', encodeURIComponent(text));
      }
      
      // 提取headers
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const headerMatches = curlCommand.matchAll(/-H\s+['"']([^'"']+)['"']?/g);
      for (const match of headerMatches) {
        const headerParts = match[1].split(':');
        if (headerParts.length >= 2) {
          const key = headerParts[0].trim();
          const value = headerParts.slice(1).join(':').trim();
          headers[key] = value;
        }
      }
      
      // 提取请求体模板
      const dataMatch = curlCommand.match(/-d\s+['"']({[^}]+})['"']?/);
      let requestBody = {};
      if (dataMatch) {
        try {
          requestBody = JSON.parse(dataMatch[1]);
        } catch (e) {
          console.warn('解析请求体失败，使用默认格式');
        }
      }
      
      // 替换请求体中的{text}占位符
      let finalBody = { ...requestBody };
      
      // 递归替换对象中的{text}占位符
      const replaceTextPlaceholders = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj.replace(/{text}/g, text);
        } else if (Array.isArray(obj)) {
          return obj.map(replaceTextPlaceholders);
        } else if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = replaceTextPlaceholders(value);
          }
          return result;
        }
        return obj;
      };
      
      finalBody = replaceTextPlaceholders(finalBody);
      
      // 如果没有找到{text}占位符，则使用默认字段名
      if (!JSON.stringify(finalBody).includes(text)) {
        finalBody = {
          ...finalBody,
          text: text,
          input: text // 兼容不同的API格式
        };
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(finalBody)
      });
      
      if (!response.ok) {
        throw new Error('TTS API调用失败: ' + response.status);
      }
      
      // 检查响应的Content-Type来决定如何处理
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        // JSON响应通常表示错误信息，先克隆响应以备后用
        const responseClone = response.clone();
        try {
          const errorResult = await response.json();
          const errorMessage = errorResult.error || errorResult.message || errorResult.detail || JSON.stringify(errorResult);
          throw new Error(`TTS服务返回错误: ${errorMessage}`);
        } catch (jsonError) {
          // 如果JSON解析失败，使用克隆的响应获取原始文本
          let rawResponse = '';
          try {
            rawResponse = await responseClone.text();
          } catch (e) {
            // 如果无法读取响应文本，显示基本错误信息
            rawResponse = `HTTP ${response.status} ${response.statusText}`;
          }
          
          // 限制显示长度，避免过长的响应内容
          const maxLength = 500;
          const displayResponse = rawResponse.length > maxLength 
            ? rawResponse.substring(0, maxLength) + '...（内容已截断）'
            : rawResponse;
            
          throw new Error(`TTS服务返回无效的JSON响应。状态码: ${response.status}，原始响应: ${displayResponse}`);
        }
      } else if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
        // 直接返回音频数据的情况，转换为base64格式
        const audioBlob = await response.blob();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
        const base64Audio = btoa(binaryString);
        const mimeType = contentType || 'audio/mpeg';
        return `data:${mimeType};base64,${base64Audio}`;
      } else {
        // 其他类型响应，尝试作为文本处理
        const textResult = await response.text();
        // 检查是否是base64编码的音频数据
        if (textResult.startsWith('data:audio/') || textResult.match(/^[A-Za-z0-9+/]+=*$/)) {
          return textResult;
        }
        throw new Error('TTS API返回了不支持的内容类型: ' + contentType);
      }
      
    } catch (error) {
      console.error('音频生成失败:', error);
      throw error;
    }
  }

  /**
   * 获取会话总音频数量
   */
  private getSessionTotalCount(sessionId: string): number {
    const session = this.sessionData.get(sessionId);
    return session ? session.dialogue.length : 0;
  }

  /**
   * 获取所有会话ID
   */
  async getAllSessions(): Promise<string[]> {
    return Array.from(this.sessionData.keys());
  }

  /**
   * 设置会话数据
   */
  setSessionData(sessionId: string, session: PodcastSession): void {
    this.sessionData.set(sessionId, session);
  }

  /**
   * 设置TTS配置
   */
  setTTSConfigs(sessionId: string, configs: any): void {
    this.ttsConfigs.set(sessionId, configs);
  }

  /**
   * 获取TTS配置
   */
  private getTTSConfigs(sessionId: string): any {
    return this.ttsConfigs.get(sessionId);
  }

  /**
   * 设置音频准备就绪回调
   */
  setNotifyAudioReadyCallback(callback: (sessionId: string, index: number, audioUrl: string) => void): void {
    this.notifyAudioReadyCallback = callback;
  }

  /**
   * 设置错误通知回调
   */
  setNotifyErrorCallback(callback: (sessionId: string, index: number, errorMessage: string) => void): void {
    this.notifyErrorCallback = callback;
  }

  /**
   * 清理会话缓存
   */
  clearSessionCache(sessionId: string): void {
    // 清理音频状态
    for (const key of this.audioStatusMap.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        this.audioStatusMap.delete(key);
      }
    }
    
    // 清理会话数据
    this.sessionData.delete(sessionId);
    
    // 清理TTS配置
    this.ttsConfigs.delete(sessionId);
    
    console.log(`[AudioSessionManager] 已清理会话缓存: ${sessionId}`);
  }
}

/**
 * Chrome扩展后台服务Worker
 */
class ServiceWorker {
  private audioManager: AudioSessionManager;

  constructor() {
    this.audioManager = new AudioSessionManager();
    // 设置音频准备就绪回调
    this.audioManager.setNotifyAudioReadyCallback(this.notifyAudioReady.bind(this));
    // 设置错误通知回调
    this.audioManager.setNotifyErrorCallback(this.notifyTTSError.bind(this));
    this.init();
  }

  /**
   * 初始化服务
   */
  private init(): void {
    // 监听扩展安装事件
    chrome.runtime.onInstalled.addListener(this.handleInstalled.bind(this));
    
    // 监听消息
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    
    console.log('RaiPod Service Worker 已启动');
  }

  /**
   * 处理扩展安装
   */
  private handleInstalled(details: chrome.runtime.InstalledDetails): void {
    console.log('RaiPod 扩展已安装:', details.reason);
    
    if (details.reason === 'install') {
      // 首次安装时的初始化逻辑
      this.initializeExtension();
    }
  }

  /**
   * 初始化扩展
   */
  private async initializeExtension(): Promise<void> {
    try {
      // 这里可以添加初始化逻辑，比如设置默认配置
      console.log('扩展初始化完成');
    } catch (error) {
      console.error('扩展初始化失败:', error);
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    console.log('收到消息:', message.type, message.data);
    
    // 异步处理消息
    (async () => {
      try {
        switch (message.type) {
          case MESSAGE_TYPES.EXTRACT_CONTENT:
            await this.handleExtractContent(message as ExtractContentMessage, sender, sendResponse);
            break;
            
          case MESSAGE_TYPES.GENERATE_PODCAST:
            await this.handleGeneratePodcast(message as GeneratePodcastMessage, sender, sendResponse);
            break;
            
          case MESSAGE_TYPES.GET_AUDIO:
            await this.handleGetAudio(message, sender, sendResponse);
            break;
            
          case MESSAGE_TYPES.GET_CURRENT_SESSION:
            await this.handleGetCurrentSession(message, sender, sendResponse);
            break;
            
          case 'CONTENT_SCRIPT_READY':
            console.log('Content Script 已准备就绪, tabId:', sender.tab?.id);
            sendResponse({ success: true, message: 'Background收到准备就绪信号' });
            break;
            
          default:
            console.warn('未知消息类型:', message.type);
            sendResponse({ success: false, error: '未知消息类型' });
        }
      } catch (error) {
        console.error('处理消息时出错:', error as Error);
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    
    return true; // 保持消息通道开放
  }

  /**
   * 处理内容提取请求
   */
  private async handleExtractContent(
    message: ExtractContentMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      const tabId = message.data?.tabId || sender.tab?.id;
      console.log('处理内容提取请求, tabId:', tabId);
      
      if (!tabId) {
        throw new Error('无法获取标签页信息');
      }

      // 检查标签页是否存在
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) {
        throw new Error('标签页不存在或已关闭');
      }

      // 检查content script是否已加载
      let contentScriptLoaded = false;
      try {
        const result = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => (window as any).RaiPodContentScriptLoaded === true
        });
        contentScriptLoaded = result[0]?.result === true;
        console.log('Content script加载状态:', contentScriptLoaded);
      } catch (checkError: any) {
         console.log('无法检查content script状态:', checkError.message);
      }

      // 如果未加载，先注入content script
      if (!contentScriptLoaded) {
        console.log('注入content script...');
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content/content-script.js']
          });
          // 等待初始化
          await new Promise(resolve => setTimeout(resolve, 800));
        } catch (injectError) {
          console.error('注入content script失败:', injectError);
          throw new Error('此页面不支持内容提取功能');
        }
      }

      // 发送消息提取内容
      let response;
      try {
        response = await chrome.tabs.sendMessage(tabId, {
          type: 'EXTRACT_PAGE_CONTENT'
        });
      } catch (messageError) {
        console.error('发送消息失败:', messageError);
        throw new Error('无法与页面内容脚本通信，请刷新页面后重试');
      }
      
      console.log('内容提取成功:', response);
      sendResponse({ success: true, data: response });
    } catch (error) {
      console.error('提取内容失败:', error as Error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }

  /**
   * 处理音频获取请求
   */
  private async handleGetAudio(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      const request = message.data as AudioRequest;
      console.log('收到音频请求:', request);
      
      const response = await this.audioManager.getAudio(request);
      console.log('音频请求处理完成:', response);
      
      sendResponse(response);
    } catch (error) {
      console.error('处理音频请求失败:', error);
      sendResponse({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 处理播客生成请求
   */
  private async handleGeneratePodcast(
    message: GeneratePodcastMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      console.log('开始生成播客:', message.data);
      
      const { content, agentConfig, ttsConfigs } = message.data;
      
      // 验证配置
      if (!agentConfig || !agentConfig.apiKey) {
        throw new Error('AI模型配置不完整');
      }
      
      if (!ttsConfigs || !ttsConfigs.voiceA || !ttsConfigs.voiceB) {
        throw new Error('语音配置不完整');
      }
      
      console.log('配置验证通过，开始生成播客对话...');
      console.log('内容标题:', content.title);
      console.log('内容长度:', content.content.length);
      console.log('图片数量:', content.images?.length || 0);
      console.log('使用模型:', agentConfig.model);
      console.log('支持图片:', agentConfig.supportsImages);
      
      // 构建多模态消息
      const messages = this.buildMultiModalMessages(content, agentConfig);
      console.log('构建的消息数量:', messages.length);
      
      // 调用OpenAI API生成播客对话
      const podcastScript = await this.generatePodcastScript(messages, agentConfig);
      console.log('播客脚本生成完成，长度:', podcastScript.length);
      
      // 解析播客脚本为对话段落
      const dialogues = this.parsePodcastScript(podcastScript);
      console.log('解析出对话段落数:', dialogues.length);
      
      // 检查解析结果
      if (dialogues.length === 0) {
        console.error('播客脚本解析失败，原始内容:', podcastScript);
        throw new Error('AI返回的内容格式不正确，无法解析为对话段落。');
      }
      
      const sessionId = 'session_' + Date.now();
      
      // 创建会话数据
      const session: PodcastSession = {
        id: sessionId,
        title: content.title,
        content: content,
        dialogue: dialogues.map((d, index) => ({
          speaker: d.speaker as 'A' | 'B',
          text: d.text,
          timestamp: Date.now() + index
        })),
        audioSegments: [],
        createdAt: Date.now(),
        status: 'generating'
      };
      
      // 设置会话数据到AudioSessionManager
      this.audioManager.setSessionData(sessionId, session);
      
      // 存储TTS配置到AudioSessionManager（临时方案）
      await this.storeTTSConfigs(sessionId, ttsConfigs);
      
      // 立即返回播客文本，不等待音频生成
      sendResponse({
        success: true,
        data: {
          sessionId,
          totalDialogues: dialogues.length,
          dialogues,
          status: 'text_ready' // 文本已准备好，音频正在生成
        }
      });
      
      console.log(`会话 ${sessionId} 创建完成，包含 ${dialogues.length} 段对话`);
      
      // 异步生成第一条音频
      this.generateFirstAudioAsync(sessionId, dialogues, ttsConfigs).catch(error => {
        console.error('生成第一条音频失败:', error);
      });
      
    } catch (error) {
      console.error('生成播客失败:', error as Error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }

  /**
   * 存储TTS配置
   */
  private async storeTTSConfigs(sessionId: string, ttsConfigs: any): Promise<void> {
    this.audioManager.setTTSConfigs(sessionId, ttsConfigs);
  }

  /**
   * 构建多模态消息（支持OpenAI和阿里云通义千问格式）
   */
  private buildMultiModalMessages(content: any, agentConfig: any): any[] {
    const messages = [];
    
    // 检测API类型
    const isAliCloudAPI = agentConfig.apiUrl?.includes('dashscope.aliyuncs.com');
    
    // 添加系统消息
    const systemPrompt = (agentConfig.systemPrompt || '你是一个专业的播客主持人。') + '\n\n请根据提供的网页内容生成一段播客对话。要求：\n1. 生成两个主持人（A和B）之间的对话\n2. 对话要生动有趣，有互动性\n3. 每段对话用"A:"或"B:"开头\n4. 对话要涵盖内容的主要观点\n5. 如果有图片，请在对话中自然地提及图片内容\n6. 对话总长度控制在合适范围内\n7. 每个人的对话不要太长，保持自然的交流节奏\n\n请直接输出对话内容，不要添加其他说明。';
    
    // 当支持多模态（包含图片）时，统一使用数组格式的content
    if (agentConfig.supportsImages && content.images && content.images.length > 0) {
      // 多模态情况下，system消息使用content数组格式
      messages.push({
        role: 'system',
        content: [
          {
            type: 'text',
            text: systemPrompt
          }
        ]
      });
    } else {
      // 纯文本情况下，system消息使用字符串格式
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    
    // 构建用户消息内容
    if (agentConfig.supportsImages && content.images && content.images.length > 0) {
      // 支持多模态的情况
      const userContent = [
        {
          type: 'text',
          text: '请为以下内容生成播客对话：\n\n标题：' + content.title + '\n\n内容：' + content.content
        }
      ];
      
      // 添加图片 - 根据API类型使用不同格式
      content.images.forEach((image: any, index: number) => {
        if (isAliCloudAPI) {
          // 阿里云通义千问格式
          userContent.push({
            type: 'image_url',
            image_url: {
              url: image.src
            }
          } as any);
        } else {
          // OpenAI格式
          userContent.push({
            type: 'image_url',
            image_url: {
              url: image.src
            }
          } as any);
        }
        
        // 添加图片描述
        if (image.alt) {
          userContent.push({
            type: 'text',
            text: '图片 ' + (index + 1) + ' 描述：' + image.alt
          });
        }
      });
      
      messages.push({
        role: 'user',
        content: userContent
      });
    } else {
      // 纯文本模式
      const textContent = '请为以下内容生成播客对话：\n\n标题：' + content.title + '\n\n内容：' + content.content;
      messages.push({
        role: 'user',
        content: textContent
      });
    }
    
    console.log('构建消息完成:', {
      messageCount: messages.length,
      hasImages: agentConfig.supportsImages && content.images?.length > 0,
      imageCount: content.images?.length || 0,
      apiType: isAliCloudAPI ? '阿里云' : 'OpenAI'
    });
    
    return messages;
  }

  /**
   * 调用AI API生成播客脚本（支持OpenAI和阿里云通义千问格式）
   */
  private async generatePodcastScript(messages: any[], agentConfig: any): Promise<string> {
    // 检测API类型并构建请求
    const isAliCloudAPI = agentConfig.apiUrl?.includes('dashscope.aliyuncs.com');
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // 根据API类型设置认证头
    if (isAliCloudAPI) {
      headers['Authorization'] = 'Bearer ' + agentConfig.apiKey;
    } else {
      // OpenAI格式
      headers['Authorization'] = 'Bearer ' + agentConfig.apiKey;
    }
    
    // 构建请求体
    const requestBody: any = {
      model: agentConfig.model,
      messages: messages
    };
    
    // 添加可选参数
    if (agentConfig.maxTokens || 2000) {
      // requestBody.max_tokens = agentConfig.maxTokens || 2000;
    }
    
    if (agentConfig.temperature !== undefined) {
      // requestBody.temperature = agentConfig.temperature;
    } else {
      // requestBody.temperature = 0.7;
    }
    
    console.log('发送API请求:', {
      url: agentConfig.apiUrl,
      model: requestBody.model,
      messagesCount: messages.length,
      isAliCloud: isAliCloudAPI
    });
    
    const response = await fetch(agentConfig.apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = isAliCloudAPI 
        ? '阿里云API调用失败: ' + response.status + ' ' + (errorData.message || errorData.error?.message || response.statusText)
        : 'OpenAI API调用失败: ' + response.status + ' ' + (errorData.error?.message || response.statusText);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    // 解析响应内容
    const content = data.choices?.[0]?.message?.content || '';
    
    if (!content) {
      console.warn('API响应数据:', data);
      throw new Error('API返回的内容为空');
    }
    
    console.log('播客脚本生成成功，长度:', content.length);
    return content;
  }

  /**
   * 解析播客脚本为对话段落
   * 仅支持JSON数组格式
   */
  private parsePodcastScript(script: string): Array<{speaker: string, text: string}> {
    const dialogues: Array<{speaker: string, text: string}> = [];
    
    try {
      // 解析JSON格式
      const trimmedScript = script.trim();
      const jsonData = JSON.parse(trimmedScript);
      
      if (!Array.isArray(jsonData)) {
        throw new Error('AI返回的内容不是数组格式');
      }
      
      for (const item of jsonData) {
        if (item && typeof item === 'object' && item.user && item.content) {
          dialogues.push({
            speaker: item.user.toString().toUpperCase(),
            text: item.content.toString().trim()
          });
        } else {
          console.warn('跳过格式不正确的对话项:', item);
        }
      }
      
    } catch (error) {
      console.error('JSON解析失败:', error);
      throw new Error('AI返回的内容格式不正确，请确保返回的是包含user和content字段的JSON数组格式。');
    }
    
    return dialogues;
  }

  /**
   * 生成音频
   */
  private async generateAudio(text: string, voiceConfig: any): Promise<string> {
    try {
      // 解析cURL命令
      const curlCommand = voiceConfig.curlCommand;
      const urlMatch = curlCommand.match(/curl\s+['"]?([^'"\s]+)['"]?/);
      if (!urlMatch) {
        throw new Error('无法解析TTS API URL');
      }
      
      let url = urlMatch[1];
      
      // 替换URL中的{text}占位符
      if (url.includes('{text}')) {
        url = url.replace('{text}', encodeURIComponent(text));
      }
      
      // 提取headers
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const headerMatches = curlCommand.matchAll(/-H\s+['"]([^'"]+)['"]?/g);
      for (const match of headerMatches) {
        const headerParts = match[1].split(':');
        if (headerParts.length >= 2) {
          const key = headerParts[0].trim();
          const value = headerParts.slice(1).join(':').trim();
          headers[key] = value;
        }
      }
      
      // 提取请求体模板
      const dataMatch = curlCommand.match(/-d\s+['"]({[^}]+})['"]?/);
      let requestBody = {};
      if (dataMatch) {
        try {
          requestBody = JSON.parse(dataMatch[1]);
        } catch (e) {
          console.warn('解析请求体失败，使用默认格式');
        }
      }
      
      // 替换请求体中的{text}占位符
      let finalBody = { ...requestBody };
      
      // 递归替换对象中的{text}占位符
      const replaceTextPlaceholders = (obj: any): any => {
        if (typeof obj === 'string') {
          return obj.replace(/{text}/g, text);
        } else if (Array.isArray(obj)) {
          return obj.map(replaceTextPlaceholders);
        } else if (obj && typeof obj === 'object') {
          const result: any = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = replaceTextPlaceholders(value);
          }
          return result;
        }
        return obj;
      };
      
      finalBody = replaceTextPlaceholders(finalBody);
      
      // 如果没有找到{text}占位符，则使用默认字段名
      if (!JSON.stringify(finalBody).includes(text)) {
        finalBody = {
          ...finalBody,
          text: text,
          input: text // 兼容不同的API格式
        };
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(finalBody)
      });
      
      if (!response.ok) {
        throw new Error('TTS API调用失败: ' + response.status);
      }
      
      // 检查响应的Content-Type来决定如何处理
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        // JSON响应通常表示错误信息
        try {
          const errorResult = await response.json();
          const errorMessage = errorResult.error || errorResult.message || errorResult.detail || JSON.stringify(errorResult);
          throw new Error(`TTS服务返回错误: ${errorMessage}`);
        } catch (jsonError) {
          // 如果JSON解析失败，说明响应体可能不是有效的JSON
          // 此时response的body已经被消费，无法再次读取
          throw new Error(`TTS服务返回无效的JSON响应`);
        }
      } else if (contentType.includes('audio/') || contentType.includes('application/octet-stream')) {
        // 直接返回音频数据的情况，转换为base64格式
        const audioBlob = await response.blob();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
        const base64Audio = btoa(binaryString);
        const mimeType = contentType || 'audio/mpeg';
        return `data:${mimeType};base64,${base64Audio}`;
      } else {
        // 其他类型响应，尝试作为文本处理
        const textResult = await response.text();
        // 检查是否是base64编码的音频数据
        if (textResult.startsWith('data:audio/') || textResult.match(/^[A-Za-z0-9+/]+=*$/)) {
          return textResult;
        }
        throw new Error('TTS API返回了不支持的内容类型: ' + contentType);
      }
      
    } catch (error) {
      console.error('音频生成失败:', error);
      throw error;
    }
  }

  /**
   * 通知前端音频准备就绪
   */
  private async notifyAudioReady(sessionId: string, index: number, audio: string): Promise<void> {
    try {
      // 使用chrome.runtime.sendMessage向popup发送消息
      // 在Manifest V3中，chrome.extension.getViews已被弃用
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.AUDIO_READY,
        data: {
          sessionId,
          index,
          audio
        }
      }).catch((error) => {
        // 如果popup未打开，sendMessage会失败，这是正常的
        console.log('发送音频准备消息失败（popup可能未打开）:', error.message);
      });
      
      console.log('已通知前端第 ' + (index + 1) + ' 条音频准备就绪');
    } catch (error) {
      console.error('通知前端音频准备就绪失败:', error);
    }
  }

  /**
   * 通知前端TTS错误
   */
  private notifyTTSError(sessionId: string, index: number, errorMessage: string): void {
    console.log(`[TTS错误通知] 开始发送TTS错误通知:`);
    console.log(`[TTS错误通知] sessionId: ${sessionId}`);
    console.log(`[TTS错误通知] index: ${index}`);
    console.log(`[TTS错误通知] errorMessage: ${errorMessage}`);
    
    const message = {
      type: MESSAGE_TYPES.TTS_ERROR,
      data: {
        sessionId,
        index,
        error: errorMessage
      }
    };
    
    console.log(`[TTS错误通知] 发送消息:`, message);
    
    try {
      chrome.runtime.sendMessage(message).then(() => {
        console.log(`[TTS错误通知] TTS错误消息发送成功`);
      }).catch(error => {
        console.error(`[TTS错误通知] 发送TTS错误消息失败:`, error);
      });
    } catch (error) {
      console.error('通知前端TTS错误失败:', error);
    }
  }

  /**
   * 异步生成第一条音频
   */
  private async generateFirstAudioAsync(sessionId: string, dialogues: any[], ttsConfigs: any): Promise<void> {
    try {
      if (dialogues.length > 0) {
        console.log('开始通过AudioSessionManager生成第一条音频');
        
        // 通过AudioSessionManager生成第一条音频，避免重复请求
        const response = await this.audioManager.getAudio({
          sessionId,
          index: 0,
          direction: 'current'
        });
        
        // AudioSessionManager会自动处理音频生成和通知，无需额外操作
        if (response.success && response.audioUrl) {
          console.log('第一条音频已从缓存获取');
        } else {
          console.log('第一条音频正在异步生成中');
        }
      }
    } catch (error) {
      console.error('异步生成第一条音频失败:', error);
    }
  }

  /**
   * 存储播客会话数据
   */
  private async storePodcastSession(sessionId: string, sessionData: any): Promise<void> {
    const storageKey = 'podcast_session_' + sessionId;
    await chrome.storage.local.set({ [storageKey]: sessionData });
  }

  /**
   * 获取播客会话数据
   */
  private async getPodcastSession(sessionId: string): Promise<any> {
    const storageKey = 'podcast_session_' + sessionId;
    const result = await chrome.storage.local.get(storageKey);
    return result[storageKey];
  }







  /**
   * 异步生成指定索引的音频
   */
  private async generateAudioAsync(sessionId: string, index: number): Promise<void> {
    try {
      console.log(`开始异步生成音频: ${sessionId}:${index}`);
      
      // 使用AudioSessionManager生成音频
      const response = await this.audioManager.getAudio({
        sessionId,
        index,
        direction: 'current'
      });
      
      if (response.success && response.audioUrl) {
        console.log(`第 ${index + 1} 条音频异步生成完成`);
        
        // 通知前端音频生成完成
        this.notifyAudioReady(sessionId, index, response.audioUrl);
      } else {
        // 如果success为false但没有error信息，说明音频正在生成中，不应该通知错误
        if (response.error) {
          console.error(`第 ${index + 1} 条音频生成失败:`, response.error);
          this.notifyTTSError(sessionId, index, response.error);
        } else {
          console.log(`第 ${index + 1} 条音频正在生成中，等待完成`);
        }
      }
    } catch (error) {
      console.error(`[ServiceWorker] 异步生成音频失败: ${sessionId}:${index}`, error);
      console.log(`[ServiceWorker] 准备通知TTS错误: sessionId=${sessionId}, index=${index}`);
      
      // 通知前端TTS错误
      this.notifyTTSError(sessionId, index, (error as Error).message || '音频生成异常');
    }
  }

  /**
   * 处理获取当前会话状态请求
   */
  private async handleGetCurrentSession(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      // 获取最近的会话ID（简单实现：获取最新的会话）
      const sessions = await this.audioManager.getAllSessions();
      if (!sessions || sessions.length === 0) {
        sendResponse({ success: false, error: '没有找到播客会话' });
        return;
      }
      
      // 获取最新的会话
      const latestSessionId = sessions[sessions.length - 1];
      const sessionData = await this.getPodcastSession(latestSessionId);
      
      if (!sessionData) {
        sendResponse({ success: false, error: '会话数据不存在' });
        return;
      }
      
      // 返回会话基本信息和第一条音频（如果有的话）
      const firstAudio = sessionData.audioCache[0] || null;
      
      sendResponse({
        success: true,
        data: {
          sessionId: latestSessionId,
          totalDialogues: sessionData.dialogues.length,
          dialogues: sessionData.dialogues,
          firstAudio: firstAudio
        }
      });
      
    } catch (error) {
      console.error('获取当前会话状态失败:', error as Error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }


}

// 启动服务Worker
new ServiceWorker();