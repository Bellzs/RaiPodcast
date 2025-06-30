import { PageContent } from '@/shared/types';
import { generateId, cleanText } from '@/shared/utils';

/**
 * 内容脚本 - 负责提取网页内容
 */
class ContentScript {
  constructor() {
    this.init();
  }

  /**
   * 初始化内容脚本
   */
  private init(): void {
    // 监听来自background的消息
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    console.log('RaiPod Content Script 已加载');
  }

  /**
   * 处理消息
   */
  private handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    if (message.type === 'EXTRACT_PAGE_CONTENT') {
      try {
        const content = this.extractPageContent();
        sendResponse(content);
      } catch (error) {
    console.error('提取内容失败:', error as Error);
        sendResponse({ error: (error as Error).message });
      }
    }
    return true;
  }

  /**
   * 提取页面主要内容
   */
  private extractPageContent(): PageContent {
    const title = this.extractTitle();
    const content = this.extractMainContent();
    const url = window.location.href;
    const timestamp = Date.now();

    return {
      title,
      content,
      url,
      timestamp
    };
  }

  /**
   * 提取页面标题
   */
  private extractTitle(): string {
    // 优先级：h1 > title > og:title
    const h1 = document.querySelector('h1');
    if (h1?.textContent?.trim()) {
      return cleanText(h1.textContent);
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle?.getAttribute('content')?.trim()) {
      return cleanText(ogTitle.getAttribute('content')!);
    }

    return cleanText(document.title || '未知标题');
  }

  /**
   * 提取页面主要内容
   */
  private extractMainContent(): string {
    // 尝试多种方式提取主要内容
    const contentSelectors = [
      'article',
      'main',
      '[role="main"]',
      '.content',
      '.post-content',
      '.article-content',
      '.entry-content',
      '#content',
      '.main-content'
    ];

    // 尝试使用语义化标签
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = this.extractTextFromElement(element);
        if (text.length > 100) { // 确保内容足够长
          return text;
        }
      }
    }

    // 如果没有找到合适的容器，提取所有段落
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map(p => cleanText(p.textContent || ''))
      .filter(text => text.length > 20) // 过滤太短的段落
      .join('\n\n');

    if (paragraphs.length > 100) {
      return paragraphs;
    }

    // 最后的备选方案：提取body中的文本
    return this.extractTextFromElement(document.body).substring(0, 5000);
  }

  /**
   * 从元素中提取文本内容
   */
  private extractTextFromElement(element: Element): string {
    // 克隆元素以避免修改原始DOM
    const clone = element.cloneNode(true) as Element;

    // 移除不需要的元素
    const unwantedSelectors = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      '.navigation',
      '.menu',
      '.sidebar',
      '.advertisement',
      '.ads',
      '.comments'
    ];

    unwantedSelectors.forEach(selector => {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });

    // 提取文本并清理
    const text = clone.textContent || '';
    return cleanText(text);
  }
}

// 启动内容脚本
new ContentScript();