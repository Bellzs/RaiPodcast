import { ChromeMessage, ExtractContentMessage, GeneratePodcastMessage } from '@/shared/types';
import { MESSAGE_TYPES } from '@/shared/constants';

/**
 * Chrome扩展后台服务Worker
 */
class ServiceWorker {
  constructor() {
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
            
          case MESSAGE_TYPES.GET_NEXT_AUDIO:
            await this.handleGetNextAudio(message, sender, sendResponse);
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
        throw new Error('AI返回的内容格式不正确，无法解析为对话段落。请确保AI返回的是JSON数组格式，包含user和content字段，或者是以"A:"和"B:"开头的对话格式。');
      }
      
      // 生成第一条音频
      let firstAudio = null;
      if (dialogues.length > 0) {
        const firstDialogue = dialogues[0];
        const voiceConfig = firstDialogue.speaker === 'A' ? ttsConfigs.voiceA : ttsConfigs.voiceB;
        firstAudio = await this.generateAudio(firstDialogue.text, voiceConfig);
        console.log('第一条音频生成完成');
      }
      
      const sessionId = 'session_' + Date.now();
      
      // 存储会话数据
      await this.storePodcastSession(sessionId, {
        dialogues,
        ttsConfigs,
        currentIndex: 0,
        audioCache: firstAudio ? { 0: firstAudio } : {}
      });
      
      sendResponse({
        success: true,
        data: {
          sessionId,
          totalDialogues: dialogues.length,
          firstAudio,
          status: 'ready'
        }
      });
      
    } catch (error) {
      console.error('生成播客失败:', error as Error);
      sendResponse({ success: false, error: (error as Error).message });
    }
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
   * 支持JSON数组格式和传统A:/B:格式
   */
  private parsePodcastScript(script: string): Array<{speaker: string, text: string}> {
    const dialogues: Array<{speaker: string, text: string}> = [];
    
    try {
      // 尝试解析JSON格式
      const trimmedScript = script.trim();
      if (trimmedScript.startsWith('[') && trimmedScript.endsWith(']')) {
        const jsonData = JSON.parse(trimmedScript);
        if (Array.isArray(jsonData)) {
          for (const item of jsonData) {
            if (item && typeof item === 'object' && item.user && item.content) {
              dialogues.push({
                speaker: item.user.toString().toUpperCase(),
                text: item.content.toString().trim()
              });
            }
          }
          return dialogues;
        }
      }
    } catch (error) {
      console.log('JSON解析失败，尝试传统格式解析:', error);
    }
    
    // 传统A:/B:格式解析
    const lines = script.split('\n').filter(line => line.trim());
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('A:')) {
        dialogues.push({
          speaker: 'A',
          text: trimmedLine.substring(2).trim()
        });
      } else if (trimmedLine.startsWith('B:')) {
        dialogues.push({
          speaker: 'B',
          text: trimmedLine.substring(2).trim()
        });
      }
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
      
      const url = urlMatch[1];
      
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
      
      // 替换文本内容
      const finalBody = {
        ...requestBody,
        text: text,
        input: text // 兼容不同的API格式
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(finalBody)
      });
      
      if (!response.ok) {
        throw new Error('TTS API调用失败: ' + response.status);
      }
      
      // 假设返回的是音频文件的URL或base64数据
      const result = await response.json();
      return result.audio_url || result.data || result.url || '';
      
    } catch (error) {
      console.error('音频生成失败:', error);
      throw error;
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
   * 处理获取下一条音频请求
   */
  private async handleGetNextAudio(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      const { sessionId, currentIndex } = message.data;
      
      if (!sessionId) {
        throw new Error('会话ID不能为空');
      }
      
      // 获取会话数据
      const sessionData = await this.getPodcastSession(sessionId);
      if (!sessionData) {
        throw new Error('会话数据不存在');
      }
      
      const { dialogues, ttsConfigs, audioCache } = sessionData;
      const nextIndex = currentIndex + 1;
      
      // 检查是否还有下一条对话
      if (nextIndex >= dialogues.length) {
        sendResponse({
          success: true,
          data: {
            hasNext: false,
            message: '播客已播放完毕'
          }
        });
        return;
      }
      
      // 检查缓存中是否已有该音频
      if (audioCache[nextIndex]) {
        sendResponse({
          success: true,
          data: {
            hasNext: true,
            audio: audioCache[nextIndex],
            index: nextIndex
          }
        });
        return;
      }
      
      // 生成下一条音频
      const nextDialogue = dialogues[nextIndex];
      const voiceConfig = nextDialogue.speaker === 'A' ? ttsConfigs.voiceA : ttsConfigs.voiceB;
      const audio = await this.generateAudio(nextDialogue.text, voiceConfig);
      
      // 更新缓存
      audioCache[nextIndex] = audio;
      await this.storePodcastSession(sessionId, {
        ...sessionData,
        audioCache
      });
      
      console.log('第 ' + (nextIndex + 1) + ' 条音频生成完成');
      
      sendResponse({
        success: true,
        data: {
          hasNext: true,
          audio: audio,
          index: nextIndex
        }
      });
      
    } catch (error) {
      console.error('获取下一条音频失败:', error as Error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }
}

// 启动服务Worker
new ServiceWorker();