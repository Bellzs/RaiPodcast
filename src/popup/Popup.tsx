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
  dialogues: Array<{speaker: string, text: string}>;
}

interface PopupState {
  pageContent: PageContent | null;
  loading: boolean;
  error: string | null;
  ttsError: string | null; // 专门用于TTS错误
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
    ttsError: null,
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

  // 监听来自service worker的消息
  useEffect(() => {
    const messageListener = (message: any) => {
      console.log('[Popup] 收到消息:', message.type, message);
      
      if (message.type === MESSAGE_TYPES.AUDIO_READY) {
        const { sessionId, index, audio } = message.data;
        console.log('处理AUDIO_READY消息:', { sessionId, index, audioLength: audio?.length });
        
        // 更新当前会话的音频状态
        setState(prev => {
          console.log('当前状态:', {
            hasSession: !!prev.podcastSession,
            currentSessionId: prev.podcastSession?.sessionId,
            targetSessionId: sessionId,
            currentIndex: prev.podcastSession?.currentIndex,
            targetIndex: index
          });
          
          if (prev.podcastSession && prev.podcastSession.sessionId === sessionId) {
            // 如果是当前索引的音频，则更新状态（移除currentAudio的检查条件）
            if (index === prev.podcastSession.currentIndex) {
              console.log(`更新状态：设置第${index + 1}条音频`);
              return {
                ...prev,
                podcastSession: {
                  ...prev.podcastSession,
                  currentAudio: audio
                }
              };
            }
          }
          return prev;
        });
        
        console.log('收到音频准备就绪通知，索引:', index);
      }
      
      if (message.type === MESSAGE_TYPES.TTS_ERROR) {
        const { sessionId, index, error } = message.data;
        console.log('[Popup] 收到TTS_ERROR消息:', { sessionId, index, error });
        console.log('[Popup] 当前会话ID:', state.podcastSession?.sessionId);
        console.log('[Popup] 消息会话ID匹配:', state.podcastSession?.sessionId === sessionId);
        
        // 显示TTS错误信息，使用专门的ttsError字段
        setState(prev => {
          console.log('[Popup] 更新TTS错误状态:', `第${index + 1}条音频生成失败: ${error}`);
          return {
            ...prev,
            ttsError: `第${index + 1}条音频生成失败: ${error}`
          };
        });
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    
    // 清理监听器
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  /**
   * 初始化弹窗
   */
  const initializePopup = async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null, ttsError: null }));
      
      // 获取当前标签页信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('无法获取当前标签页');
      }

      // 并行获取页面内容、配置信息和当前会话状态
      const [contentResponse, agentConfig, ttsConfigs, sessionResponse] = await Promise.all([
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.EXTRACT_CONTENT,
          data: { tabId: tab.id }
        }),
        StorageManager.getCurrentAgentConfig(),
        StorageManager.getCurrentTTSConfigs(),
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.GET_CURRENT_SESSION
        })
      ]);

      if (!contentResponse) {
        throw new Error('无法连接到后台服务');
      }

      if (contentResponse.success) {
        // 检查是否有现有的播客会话需要恢复
        let podcastSession = null;
        if (sessionResponse && sessionResponse.success) {
          console.log('恢复播客会话:', sessionResponse.data);
          podcastSession = {
            sessionId: sessionResponse.data.sessionId,
            totalDialogues: sessionResponse.data.totalDialogues,
            currentIndex: 0, // 默认从第一条开始
            isPlaying: false,
            currentAudio: sessionResponse.data.firstAudio || null,
            dialogues: sessionResponse.data.dialogues || []
          };
        }
        
        setState(prev => ({
          ...prev,
          pageContent: contentResponse.data,
          currentAgent: agentConfig,
          currentVoices: ttsConfigs || { voiceA: null, voiceB: null },
          podcastSession: podcastSession,
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
      setState(prev => ({ ...prev, generating: true, error: null, ttsError: null }));

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
        
        // 检查是否有音频错误
        let errorMessage = null;
        if (response.data.audioError) {
          errorMessage = `音频生成失败: ${response.data.audioError}。请检查TTS配置，特别是音色curl设置是否正确。`;
        }
        
        // 立即创建播客会话，不管音频是否生成成功
        setState(prev => ({
          ...prev,
          generating: false, // 立即停止生成状态，显示播放器
          error: errorMessage, // 显示音频错误提示
          podcastSession: {
            sessionId: response.data.sessionId,
            totalDialogues: response.data.totalDialogues,
            currentIndex: 0,
            isPlaying: false,
            currentAudio: response.data.firstAudio || null, // 音频可能为空
            dialogues: response.data.dialogues || []
          }
        }));
        
        // 如果第一个音频生成成功，预加载下一个音频
        if (response.data.firstAudio) {
          setTimeout(() => {
            loadNextAudio();
          }, 100);
        }
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
    
    const audioElement = document.querySelector('audio') as HTMLAudioElement;
    
    if (state.podcastSession.isPlaying) {
      // 暂停播放
      if (audioElement) {
        audioElement.pause();
      }
      setState(prev => ({
        ...prev,
        podcastSession: prev.podcastSession ? {
          ...prev.podcastSession,
          isPlaying: false
        } : null
      }));
    } else {
      // 开始播放
      if (audioElement) {
        audioElement.play().catch(error => {
          console.error('音频播放失败:', error);
        });
      }
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
    
    const nextIndex = state.podcastSession.currentIndex + 1;
    if (nextIndex >= state.podcastSession.totalDialogues) return;
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_AUDIO,
        data: {
          sessionId: state.podcastSession.sessionId,
          index: nextIndex,
          direction: 'next' // 明确指定为下一条音频请求
        }
      });
      
      if (response.success) {
        console.log('下一条音频预加载完成');
      }
    } catch (error) {
      console.error('预加载下一条音频失败:', error);
    }
  };

  /**
   * 播放上一条
   */
  const playPrevious = async (): Promise<void> => {
    if (!state.podcastSession || state.podcastSession.currentIndex <= 0) return;
    
    const newIndex = state.podcastSession.currentIndex - 1;
    const wasPlaying = state.podcastSession.isPlaying; // 记住之前的播放状态
    
    // 立即更新界面显示
    setState(prev => ({
      ...prev,
      podcastSession: prev.podcastSession ? {
        ...prev.podcastSession,
        currentIndex: newIndex,
        currentAudio: null, // 先清空音频
        isPlaying: false
      } : null
    }));
    
    // 异步加载音频
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_AUDIO,
        data: {
          sessionId: state.podcastSession.sessionId,
          index: newIndex,
          direction: 'previous' // 明确指定为上一条音频请求
        }
      });
      
      if (response.success && response.audioUrl) {
        setState(prev => ({
          ...prev,
          podcastSession: prev.podcastSession ? {
            ...prev.podcastSession,
            currentAudio: response.audioUrl,
            isPlaying: wasPlaying // 保持之前的播放状态
          } : null
        }));
      } else if (!response.success && response.error === '音频正在生成中，请稍候') {
        // 音频正在生成中，保持当前状态，等待AUDIO_READY消息
        console.log('音频正在生成中，等待完成通知');
      }
    } catch (error) {
      console.error('加载上一条音频失败:', error);
    }
  };

  /**
   * 播放下一条
   */
  const playNext = async (): Promise<void> => {
    if (!state.podcastSession) return;
    
    const newIndex = state.podcastSession.currentIndex + 1;
    
    // 检查是否超出范围
    if (newIndex >= state.podcastSession.totalDialogues) {
      setState(prev => ({
        ...prev,
        podcastSession: prev.podcastSession ? {
          ...prev.podcastSession,
          isPlaying: false
        } : null
      }));
      console.log('播客播放完毕');
      return;
    }
    
    const wasPlaying = state.podcastSession.isPlaying; // 记住之前的播放状态
    
    // 立即更新界面显示
    setState(prev => ({
      ...prev,
      podcastSession: prev.podcastSession ? {
        ...prev.podcastSession,
        currentIndex: newIndex,
        currentAudio: null, // 先清空音频
        isPlaying: false
      } : null
    }));
    
    // 异步加载音频
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_AUDIO,
        data: {
          sessionId: state.podcastSession.sessionId,
          index: newIndex,
          direction: 'next' // 明确指定为下一条音频请求
        }
      });
      
      if (response.success && response.audioUrl) {
        setState(prev => ({
          ...prev,
          podcastSession: prev.podcastSession ? {
            ...prev.podcastSession,
            currentAudio: response.audioUrl,
            isPlaying: wasPlaying // 保持之前的播放状态
          } : null
        }));
        
        // 预加载下一条
        await loadNextAudio();
      } else if (!response.success && response.error === '音频正在生成中，请稍候') {
        // 音频正在生成中，保持当前状态，等待AUDIO_READY消息
        console.log('音频正在生成中，等待完成通知');
      }
    } catch (error) {
      console.error('加载下一条音频失败:', error);
    }
  };

  /**
   * 音频播放结束时的处理（自动播放下一段）
   */
  const handleAudioEnded = async (): Promise<void> => {
    if (!state.podcastSession) return;
    
    const newIndex = state.podcastSession.currentIndex + 1;
    
    // 检查是否超出范围
    if (newIndex >= state.podcastSession.totalDialogues) {
      setState(prev => ({
        ...prev,
        podcastSession: prev.podcastSession ? {
          ...prev.podcastSession,
          isPlaying: false
        } : null
      }));
      console.log('播客播放完毕');
      return;
    }
    
    // 立即更新界面显示，保持播放状态
    setState(prev => ({
      ...prev,
      podcastSession: prev.podcastSession ? {
        ...prev.podcastSession,
        currentIndex: newIndex,
        currentAudio: null, // 先清空音频
        isPlaying: false
      } : null
    }));
    
    // 异步加载音频
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_AUDIO,
        data: {
          sessionId: state.podcastSession.sessionId,
          index: newIndex,
          direction: 'next' // 明确指定为下一条音频请求
        }
      });
      
      if (response.success && response.audioUrl) {
        setState(prev => ({
          ...prev,
          podcastSession: prev.podcastSession ? {
            ...prev.podcastSession,
            currentAudio: response.audioUrl,
            isPlaying: true // 自动播放下一段
          } : null
        }));
        
        // 预加载下一条
        await loadNextAudio();
      } else if (!response.success && response.error === '音频正在生成中，请稍候') {
        // 音频正在生成中，保持当前状态，等待AUDIO_READY消息
        console.log('音频正在生成中，等待完成通知');
      }
    } catch (error) {
      console.error('加载下一条音频失败:', error);
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
    <>
      {state.error && (
        <div className="error">
          <div className="error-content">
            {state.error}
          </div>
        </div>
      )}
      {state.ttsError && (
        <div className="error tts-error">
          <div className="error-content scrollable">
            {state.ttsError}
          </div>
          <button 
            className="error-close-btn"
            onClick={() => setState(prev => ({ ...prev, ttsError: null }))}
            title="关闭错误提示"
          >
            ×
          </button>
        </div>
      )}
    </>
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
      
      // 显示复制成功提示
      const button = document.querySelector('.page-info .copy-btn') as HTMLElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✅ 已复制';
        button.style.backgroundColor = '#28a745';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.backgroundColor = '';
        }, 2000);
      }
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
          <span className="config-label">🎵 角色A:</span>
          <span className="config-value">
            {state.currentVoices.voiceA?.name || '未配置'}
          </span>
        </div>
        <div className="config-item">
          <span className="config-label">🎵 角色B:</span>
          <span className="config-value">
            {state.currentVoices.voiceB?.name || '未配置'}
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
        <div className="info-header page-title-header">
          <h3 className="page-title">{state.pageContent.title}</h3>
          <button 
            className="copy-btn"
            onClick={copyPageContent}
            title="复制标题、内容和图片链接"
          >
            📄
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
        className={`generate-btn ${state.generating ? 'generating' : ''}`}
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
    return <></>;
  };

  /**
   * 复制所有对话内容
   */
  const copyAllDialogues = async (): Promise<void> => {
    if (!state.podcastSession?.dialogues) return;
    
    try {
      const dialogueText = state.podcastSession.dialogues
        .map(dialogue => `角色${dialogue.speaker}：${dialogue.text}`)
        .join('\n');
      
      await navigator.clipboard.writeText(dialogueText);
      
      // 显示复制成功提示
      const button = document.querySelector('.podcast-player .copy-btn') as HTMLElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = '✅ 已复制';
        button.style.backgroundColor = '#28a745';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.backgroundColor = '';
        }, 2000);
      }
    } catch (error) {
      console.error('复制失败:', error);
    }
  };

  /**
   * 渲染播客播放器
   */
  const renderPodcastPlayer = (): JSX.Element => {
    if (!state.podcastSession) return <></>;
    
    const { currentIndex, totalDialogues, isPlaying, currentAudio, dialogues } = state.podcastSession;
    const currentDialogue = dialogues[currentIndex];
    
    return (
      <div className="podcast-player">
        <div className="player-header">
          <h3 className="player-title">🎙️ 播客播放器</h3>
          <div className="header-buttons">
            <button 
              className="copy-btn"
              onClick={copyAllDialogues}
              title="复制全部对话内容"
              style={{ marginRight: '8px' }}
            >
              📄
            </button>
            <button 
              className="close-btn"
              onClick={stopPlayback}
              title="关闭播放器"
            >
              ✕
            </button>
          </div>
        </div>
        
        <div className="player-info">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${((currentIndex + 1) / totalDialogues) * 100}%` }}
            ></div>
          </div>
        </div>
        
        {/* 音频播放器 - 即使没有音频也显示容器 */}
        <div className="audio-container">
          {currentAudio ? (
            <audio 
              controls
              autoPlay={isPlaying}
              onEnded={handleAudioEnded}
              onPlay={() => loadNextAudio()} // 音频开始播放时预加载下一条
              key={currentIndex}
            >
              <source src={currentAudio} type="audio/mpeg" />
              您的浏览器不支持音频播放。
            </audio>
          ) : (
            <div style={{
              padding: '12px',
              textAlign: 'center',
              color: '#6c757d',
              fontSize: '12px',
              backgroundColor: '#f8f9fa',
              borderRadius: '4px',
              border: '1px solid #e9ecef'
            }}>
              🎵 音频生成中，请稍候...
            </div>
          )}
        </div>
        
        <div className="player-controls">
          <button 
            className="control-btn"
            onClick={playPrevious}
            disabled={currentIndex <= 0}
          >
            ⏮️ 上一段
          </button>
          
          <button 
            className="control-btn play-btn"
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
        
        {/* 当前台词显示 */}
        {currentDialogue && (
          <div className="current-dialogue" style={{
            margin: '4px 0',
            padding: '6px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #e9ecef'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: '#6c757d',
              // marginBottom: '3px'
            }}>
              <span>角色{currentDialogue.speaker}</span>
              <span>第 {currentIndex + 1} / {totalDialogues} 段</span>
            </div>
            <div style={{
              fontSize: '14px',
              lineHeight: '1.4',
              color: '#333'
            }}>
              {currentDialogue.text}
            </div>
          </div>
        )}
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
        {!state.loading && (
          <>
            {(state.error || state.ttsError) && renderError()}
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