import React, { useState, useEffect } from 'react';
import { PageContent, AgentConfig, TTSConfig } from '@/shared/types';
import { MESSAGE_TYPES } from '@/shared/constants';
import { StorageManager } from '@/shared/storage';
import './popup.css';

interface PodcastSession {
  sessionId: string;
  totalDialogues: number;
  currentIndex: number;
  isPlaying: boolean;
  currentAudio: string | null;
}

interface PopupState {
  pageContent: PageContent | null;
  loading: boolean;
  error: string | null;
  generating: boolean;
  currentAgent: AgentConfig | null;
  currentVoices: { voiceA: TTSConfig | null; voiceB: TTSConfig | null };
  podcastSession: PodcastSession | null;
}

const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    pageContent: null,
    loading: true,
    error: null,
    generating: false,
    currentAgent: null,
    currentVoices: { voiceA: null, voiceB: null },
    podcastSession: null
  });
  
  // 防止重复初始化的标志
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
      initializePopup();
    }
  }, [isInitialized]);

  /**
   * 初始化弹窗
   */
  const initializePopup = async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // 获取当前标签页信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('无法获取当前标签页');
      }

      // 并行获取页面内容和配置信息
      const [contentResponse, agentConfig, ttsConfigs] = await Promise.all([
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.EXTRACT_CONTENT,
          data: { tabId: tab.id }
        }),
        StorageManager.getCurrentAgentConfig(),
        StorageManager.getCurrentTTSConfigs()
      ]);

      if (!contentResponse) {
        throw new Error('无法连接到后台服务');
      }

      if (contentResponse.success) {
        setState(prev => ({
          ...prev,
          pageContent: contentResponse.data,
          currentAgent: agentConfig,
          currentVoices: ttsConfigs || { voiceA: null, voiceB: null },
          loading: false
        }));
      } else {
        throw new Error(contentResponse.error || '提取内容失败');
      }
    } catch (error) {
      console.error('初始化失败:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '初始化失败'
      }));
    }
  };

  /**
   * 生成播客
   */
  const handleGeneratePodcast = async (): Promise<void> => {
    if (!state.pageContent) {
      return;
    }

    try {
      setState(prev => ({ ...prev, generating: true, error: null }));

      // 获取当前配置
      const [agentConfig, ttsConfigs] = await Promise.all([
        StorageManager.getCurrentAgentConfig(),
        StorageManager.getCurrentTTSConfigs()
      ]);
      
      if (!agentConfig) {
        throw new Error('请先配置AI模型');
      }
      
      if (!ttsConfigs.voiceA || !ttsConfigs.voiceB) {
        throw new Error('请先配置角色A和角色B的语音');
      }
      
      // 发送生成播客请求
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GENERATE_PODCAST,
        data: {
          content: state.pageContent,
          agentConfig,
          ttsConfigs
        }
      });

      if (!response) {
        throw new Error('无法连接到后台服务');
      }

      if (response.success) {
        console.log('播客生成成功:', response.data);
        setState(prev => ({
          ...prev,
          podcastSession: {
            sessionId: response.data.sessionId,
            totalDialogues: response.data.totalDialogues,
            currentIndex: 0,
            isPlaying: false,
            currentAudio: response.data.firstAudio
          }
        }));
      } else {
        throw new Error(response.error || '生成播客失败');
      }
    } catch (error) {
      console.error('生成播客失败:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : '生成播客失败'
      }));
    } finally {
      setState(prev => ({ ...prev, generating: false }));
    }
  };

  /**
   * 打开设置页面
   */
  const openOptionsPage = (): void => {
    chrome.runtime.openOptionsPage();
  };

  /**
   * 播放/暂停音频
   */
  const togglePlayPause = async (): Promise<void> => {
    if (!state.podcastSession) return;
    
    if (state.podcastSession.isPlaying) {
      // 暂停播放
      setState(prev => ({
        ...prev,
        podcastSession: prev.podcastSession ? {
          ...prev.podcastSession,
          isPlaying: false
        } : null
      }));
    } else {
      // 开始播放
      setState(prev => ({
        ...prev,
        podcastSession: prev.podcastSession ? {
          ...prev.podcastSession,
          isPlaying: true
        } : null
      }));
      
      // 预加载下一条音频
      await loadNextAudio();
    }
  };

  /**
   * 加载下一条音频
   */
  const loadNextAudio = async (): Promise<void> => {
    if (!state.podcastSession) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_NEXT_AUDIO,
        data: {
          sessionId: state.podcastSession.sessionId,
          currentIndex: state.podcastSession.currentIndex
        }
      });
      
      if (response.success && response.data.hasNext) {
        console.log('下一条音频加载完成');
      }
    } catch (error) {
      console.error('加载下一条音频失败:', error);
    }
  };

  /**
   * 播放下一条
   */
  const playNext = async (): Promise<void> => {
    if (!state.podcastSession) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_NEXT_AUDIO,
        data: {
          sessionId: state.podcastSession.sessionId,
          currentIndex: state.podcastSession.currentIndex
        }
      });
      
      if (response.success) {
        if (response.data.hasNext) {
          setState(prev => ({
            ...prev,
            podcastSession: prev.podcastSession ? {
              ...prev.podcastSession,
              currentIndex: response.data.index,
              currentAudio: response.data.audio,
              isPlaying: true
            } : null
          }));
          
          // 预加载下一条
          await loadNextAudio();
        } else {
          // 播放完毕
          setState(prev => ({
            ...prev,
            podcastSession: prev.podcastSession ? {
              ...prev.podcastSession,
              isPlaying: false
            } : null
          }));
          console.log('播客播放完毕');
        }
      }
    } catch (error) {
      console.error('播放下一条失败:', error);
    }
  };

  /**
   * 停止播放
   */
  const stopPlayback = (): void => {
    setState(prev => ({ ...prev, podcastSession: null }));
  };

  /**
   * 渲染加载状态
   */
  const renderLoading = (): JSX.Element => (
    <div className="loading">
      <div className="loading-spinner"></div>
      <span>正在加载...</span>
    </div>
  );

  /**
   * 渲染错误状态
   */
  const renderError = (): JSX.Element => (
    <div className="error">
      {state.error}
    </div>
  );

  /**
   * 复制页面内容到剪贴板
   */
  const copyPageContent = async (): Promise<void> => {
    if (!state.pageContent) return;
    
    try {
      let contentToCopy = `${state.pageContent.title}\n\n${state.pageContent.content}`;
      
      // 添加图片链接列表
      if (state.pageContent.images && state.pageContent.images.length > 0) {
        contentToCopy += '\n\n图片链接：\n';
        state.pageContent.images.forEach((image, index) => {
          contentToCopy += `${index + 1}. ${image.src}${image.alt ? ` (${image.alt})` : ''}\n`;
        });
      }
      
      await navigator.clipboard.writeText(contentToCopy);
      console.log('页面内容已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  /**
   * 渲染配置信息
   */
  const renderConfigInfo = (): JSX.Element => {
    return (
      <div className="config-info">
        <div className="config-item">
          <span className="config-label">🤖 AI模型:</span>
          <span className="config-value">
            {state.currentAgent?.name || '未配置'}
            {state.currentAgent?.supportsImages && (
              <span className="image-support-badge">📷</span>
            )}
          </span>
        </div>
        <div className="config-item">
          <span className="config-label">🎵 音色:</span>
          <span className="config-value">
            {state.currentVoices.voiceA?.name || '未配置'} / {state.currentVoices.voiceB?.name || '未配置'}
          </span>
        </div>
      </div>
    );
  };

  /**
   * 渲染页面信息
   */
  const renderPageInfo = (): JSX.Element => {
    if (!state.pageContent) return <></>;

    return (
      <div className="page-info">
        <div className="info-header">
          <h3 className="page-title">{state.pageContent.title}</h3>
          <button 
            className="copy-btn"
            onClick={copyPageContent}
            title="复制标题、内容和图片链接"
          >
            ⎘
          </button>
        </div>
        <div className="page-content">
          {state.pageContent.content.length > 150 
            ? `${state.pageContent.content.substring(0, 150)}...` 
            : state.pageContent.content
          }
        </div>
        {state.pageContent.images && state.pageContent.images.length > 0 && (
          <div className="images-section">
            <h4 className="images-title">页面图片 ({state.pageContent.images.length})</h4>
            <div className="images-list">
              {state.pageContent.images.map((image, index) => (
                <div key={index} className="image-item">
                  <img 
                    src={image.src} 
                    alt={image.alt || `图片 ${index + 1}`}
                    className="image-thumbnail"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                  <span className="image-alt">{image.alt || `图片 ${index + 1}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  /**
   * 渲染操作按钮
   */
  const renderActions = (): JSX.Element => (
    <div className="action-section">
      <button
        className="generate-btn"
        onClick={handleGeneratePodcast}
        disabled={!state.pageContent || state.generating}
      >
        {state.generating ? '正在生成...' : '生成播客'}
      </button>
    </div>
  );

  /**
   * 渲染状态信息
   */
  const renderStatus = (): JSX.Element => {
    if (state.generating) {
      return (
        <div className="status-section">
          <p className="status-text">正在处理页面内容，请稍候...</p>
        </div>
      );
    }
    return <></>;
  };

  /**
   * 渲染播客播放器
   */
  const renderPodcastPlayer = (): JSX.Element => {
    if (!state.podcastSession) return <></>;
    
    const { currentIndex, totalDialogues, isPlaying, currentAudio } = state.podcastSession;
    
    return (
      <div className="podcast-player">
        <div className="player-header">
          <h3 className="player-title">🎙️ 播客播放器</h3>
          <button 
            className="close-btn"
            onClick={stopPlayback}
            title="关闭播放器"
          >
            ✕
          </button>
        </div>
        
        <div className="player-info">
          <p className="track-info">
            第 {currentIndex + 1} / {totalDialogues} 段
          </p>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${((currentIndex + 1) / totalDialogues) * 100}%` }}
            ></div>
          </div>
        </div>
        
        {currentAudio && (
          <div className="audio-container">
            <audio 
              controls
              autoPlay={isPlaying}
              onEnded={playNext}
              key={currentIndex}
            >
              <source src={currentAudio} type="audio/mpeg" />
              您的浏览器不支持音频播放。
            </audio>
          </div>
        )}
        
        <div className="player-controls">
          <button 
            className="control-btn"
            onClick={togglePlayPause}
            disabled={!currentAudio}
          >
            {isPlaying ? '⏸️ 暂停' : '▶️ 播放'}
          </button>
          
          <button 
            className="control-btn"
            onClick={playNext}
            disabled={currentIndex >= totalDialogues - 1}
          >
            ⏭️ 下一段
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="popup-container">
      {/* 头部 */}
      <div className="popup-header">
        <img src="../assets/icon-128.png" alt="RaiPod Logo" className="popup-logo" />
        <h1 className="popup-title">RaiPod</h1>
      </div>

      {/* 内容区域 */}
      <div className="popup-content">
        {state.loading && renderLoading()}
        {state.error && renderError()}
        {!state.loading && !state.error && (
          <>
            {renderConfigInfo()}
            {renderActions()}
            {renderPodcastPlayer()}
            {renderPageInfo()}
            {renderStatus()}
          </>
        )}
      </div>

      {/* 设置链接 */}
      <a
        href="#"
        className="settings-link"
        onClick={(e) => {
          e.preventDefault();
          openOptionsPage();
        }}
      >
设置
      </a>
    </div>
  );
};

export default Popup;