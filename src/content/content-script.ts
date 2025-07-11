import { PageContent, PageImage } from '@/shared/types';
import { generateId, cleanText } from '@/shared/utils';

/**
 * 内容脚本 - 负责提取网页内容
 */
class ContentScript {
  private isInitialized = false;

  constructor() {
    this.init();
  }

  /**
   * 初始化内容脚本
   */
  private init(): void {
    if (this.isInitialized) {
      console.log('RaiPodcast Content Script 已经初始化过了');
      return;
    }

    // 监听来自background的消息
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
    this.isInitialized = true;
    console.log('RaiPodcast Content Script 已加载并初始化');
    
    // 向background发送准备就绪信号
    if (chrome.runtime?.id) {
      chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' }).catch(() => {
        // 忽略错误，可能是background还未准备好
      });
    }
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
    const images = this.extractContentImages();
    const url = window.location.href;
    const timestamp = Date.now();

    return {
      title,
      content,
      images,
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
   * 提取内容区域的图片
   */
  private extractContentImages(): PageImage[] {
    const images: PageImage[] = [];
    
    // 内容区域选择器
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
    
    // 先尝试从内容区域提取图片
    for (const selector of contentSelectors) {
      const contentElement = document.querySelector(selector);
      if (contentElement) {
        const contentImages = this.extractImagesFromElement(contentElement);
        if (contentImages.length > 0) {
          images.push(...contentImages);
          break; // 找到内容区域就停止
        }
      }
    }
    
    // 如果内容区域没有图片，从整个页面提取（排除导航、广告等）
    if (images.length === 0) {
      images.push(...this.extractImagesFromElement(document.body));
    }
    
    return images;
  }
  
  /**
   * 从指定元素中提取图片
   */
  private extractImagesFromElement(element: Element): PageImage[] {
    const images: PageImage[] = [];
    const imgElements = element.querySelectorAll('img');
    
    imgElements.forEach(img => {
      // 过滤掉不相关的图片
      if (this.isContentImage(img)) {
        // 优先提取 data-src（如微信文章图片），其次 data-lazy-src，再次 src
        const src = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.src;
        if (src && this.isValidImageUrl(src, img)) {
          // 优先用 data-w 和 data-ratio 计算宽高
          let width: number | undefined = undefined;
          let height: number | undefined = undefined;
          const dataW = img.getAttribute('data-w');
          const dataRatio = img.getAttribute('data-ratio');
          if (dataW && dataRatio) {
            width = parseInt(dataW, 10);
            const ratio = parseFloat(dataRatio);
            if (!isNaN(width) && !isNaN(ratio) && ratio > 0) {
              height = Math.round(width * ratio);
            }
          } else {
            width = img.naturalWidth || undefined;
            height = img.naturalHeight || undefined;
          }
          images.push({
            src: this.normalizeImageUrl(src),
            alt: img.alt || '',
            width,
            height
          });
        }
      }
    });
    
    return images;
  }
  
  /**
   * 判断是否为内容相关图片
   */
  private isContentImage(img: HTMLImageElement): boolean {
    // 排除小尺寸图片（可能是图标、按钮等）
    if (img.width < 100 || img.height < 100) {
      return false;
    }
    
    // 排除特定类名或ID的图片
    const excludePatterns = [
      'logo', 'icon', 'avatar', 'profile', 'banner', 'ad', 'advertisement',
      'navigation', 'nav', 'menu', 'sidebar', 'footer', 'header'
    ];
    
    const className = img.className.toLowerCase();
    const id = img.id.toLowerCase();
    const alt = img.alt.toLowerCase();
    
    for (const pattern of excludePatterns) {
      if (className.includes(pattern) || id.includes(pattern) || alt.includes(pattern)) {
        return false;
      }
    }
    
    // 检查父元素是否为排除的容器
    let parent = img.parentElement;
    while (parent && parent !== document.body) {
      const parentClass = parent.className.toLowerCase();
      for (const pattern of excludePatterns) {
        if (parentClass.includes(pattern)) {
          return false;
        }
      }
      parent = parent.parentElement;
    }
    
    return true;
  }
  
  /**
   * 验证图片URL是否有效
   */
  private isValidImageUrl(url: string, img?: HTMLImageElement): boolean {
    // 排除base64图片（通常是小图标）
    if (url.startsWith('data:')) {
      return false;
    }
    // 微信文章图片特殊处理：允许 mmbiz.qpic.cn/sz_mmbiz_jpg/
    if (/mmbiz\.qpic\.cn\/sz_mmbiz_\w+\//.test(url)) {
      return true;
    }
    // 检查是否为图片格式
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const urlLower = url.toLowerCase();
    if (imageExtensions.some(ext => urlLower.includes(ext) || urlLower.match(new RegExp(`\\${ext}(\\?|$)`)))) {
      return true;
    }
    // 允许带有 image/img 关键词的 url
    if (url.includes('image') || url.includes('img')) {
      return true;
    }
    // 兼容微信文章图片的 data-type 属性
    if (img && img.getAttribute('data-type')) {
      return true;
    }
    return false;
  }
  
  /**
   * 标准化图片URL
   */
  private normalizeImageUrl(url: string): string {
    // 如果是相对路径，转换为绝对路径
    if (url.startsWith('//')) {
      return window.location.protocol + url;
    }
    if (url.startsWith('/')) {
      return window.location.origin + url;
    }
    if (!url.startsWith('http')) {
      return new URL(url, window.location.href).href;
    }
    return url;
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
if (!(window as any).RaiPodcastContentScript) {
  (window as any).RaiPodcastContentScript = new ContentScript();
  console.log('RaiPodcast Content Script 实例已创建');
} else {
  console.log('RaiPodcast Content Script 实例已存在');
}

// 添加全局标识符
(window as any).RaiPodcastContentScriptLoaded = true;