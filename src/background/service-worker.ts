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
  private async handleMessage(
    message: ChromeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): Promise<boolean> {
    try {
      console.log('收到消息:', message.type, message.data);
      
      switch (message.type) {
        case MESSAGE_TYPES.EXTRACT_CONTENT:
          await this.handleExtractContent(message as ExtractContentMessage, sender, sendResponse);
          break;
          
        case MESSAGE_TYPES.GENERATE_PODCAST:
          await this.handleGeneratePodcast(message as GeneratePodcastMessage, sender, sendResponse);
          break;
          
        default:
          console.warn('未知消息类型:', message.type);
          sendResponse({ success: false, error: '未知消息类型' });
      }
    } catch (error) {
      console.error('处理消息时出错:', error as Error);
      sendResponse({ success: false, error: (error as Error).message });
    }
    
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
      if (!sender.tab?.id) {
        throw new Error('无法获取标签页信息');
      }

      // 向content script发送提取内容的请求
      const response = await chrome.tabs.sendMessage(sender.tab.id, {
        type: 'EXTRACT_PAGE_CONTENT'
      });
      
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