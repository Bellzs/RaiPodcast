import { MESSAGE_TYPES } from '@/shared/constants';
import { ChromeMessage, ExtractContentMessage, GeneratePodcastMessage } from '@/shared/types';

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
      // 这里将来会实现AI对话生成和TTS合成
      console.log('开始生成播客:', message.data);
      
      // 模拟异步处理
      setTimeout(() => {
        sendResponse({
          success: true,
          data: {
            message: '播客生成功能正在开发中...'
          }
        });
      }, 1000);
      
    } catch (error) {
      console.error('生成播客失败:', error as Error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }
}

// 启动服务Worker
new ServiceWorker();