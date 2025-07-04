import React, { useState, useEffect } from 'react';
import { PageContent, AgentConfig, TTSConfig } from '@/shared/types';
import { MESSAGE_TYPES } from '@/shared/constants';
import { StorageManager } from '@/shared/storage';
import packageJson from '../../package.json';
import './popup.css';

interface PodcastSession {
  sessionId: string;
  totalDialogues: number;
  currentIndex: number;
  isPlaying: boolean;
  currentAudio: string | null;
  dialogues: Array<{speaker: string, text: string}>;
}

interface ErrorDetails {
  originalError: string;
  timestamp: string;
  context: string;
  apiResponse?: any;
  originalScript?: string;
  parseError?: string;
  statusCode?: number;
}

interface PopupState {
  pageContent: PageContent | null;
  loading: boolean;
  error: string | null;
  errorDetails: ErrorDetails | null; // 详细错误信息
  ttsError: string | null; // 专门用于TTS错误
  generating: boolean;
  currentAgent: AgentConfig | null;
  allAgents: AgentConfig[]; // 新增：所有可用的AI模型
  allTTSConfigs: TTSConfig[]; // 新增：所有可用的TTS配置
  currentVoices: { voiceA: TTSConfig | null; voiceB: TTSConfig | null };
  podcastSession: PodcastSession | null;
}

const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    pageContent: null,
    loading: true,
    error: null,
    errorDetails: null,
    ttsError: null,
    generating: false,
    currentAgent: null,
    allAgents: [], // 初始化为空数组
    allTTSConfigs: [], // 初始化为空数组
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
          if (prev.podcastSession && prev.podcastSession.sessionId === sessionId) {
            // 只有当前索引的音频才更新播放状态
            if (index === prev.podcastSession.currentIndex) {
              console.log(`更新状态：设置第${index + 1}条音频`);
              return {
                ...prev,
                podcastSession: {
                  ...prev.podcastSession,
                  currentAudio: audio
                  // 保持原有的isPlaying状态，如果之前是true（自动播放），则会自动开始播放
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
        
        // 显示TTS错误信息
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
      setState(prev => ({ ...prev, loading: true, error: null, errorDetails: null, ttsError: null }));
      
      // 获取当前标签页信息
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('无法获取当前标签页');
      }

      // 并行获取页面内容、配置信息、所有Agent配置和当前会话状态
      const [contentResponse, agentConfig, allAgents, allTTSConfigs, ttsConfigs, sessionResponse] = await Promise.all([
        chrome.runtime.sendMessage({
          type: MESSAGE_TYPES.EXTRACT_CONTENT,
          data: { tabId: tab.id }
        }),
        StorageManager.getCurrentAgentConfig(),
        StorageManager.getAgentConfigs(), // 获取所有Agent配置
        StorageManager.getTTSConfigs(), // 获取所有TTS配置
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
          allAgents: allAgents, // 更新所有Agent配置
          allTTSConfigs: allTTSConfigs, // 更新所有TTS配置
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
        error: error instanceof Error ? error.message : '初始化失败',
        errorDetails: null
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
      setState(prev => ({ ...prev, generating: true, error: null, errorDetails: null, ttsError: null }));

      // 获取当前配置
      const [agentConfig, ttsConfigs] = await Promise.all([
        StorageManager.getCurrentAgentConfig(),
        StorageManager.getCurrentTTSConfigs()
      ]);
      
      if (!agentConfig) {
        throw new Error('点击下方设置-请先配置AI模型');
      }
      
      if (!ttsConfigs.voiceA || !ttsConfigs.voiceB) {
        throw new Error('点击下方设置-请先配置角色A和角色B的语音');
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
        
        // 立即创建播客会话
        setState(prev => ({
          ...prev,
          generating: false, // 立即停止生成状态，显示播放器
          error: errorMessage, // 显示音频错误提示
          podcastSession: {
            sessionId: response.data.sessionId,
            totalDialogues: response.data.totalDialogues,
            currentIndex: 0,
            isPlaying: false,
            currentAudio: null, // 初始为空，等待音频加载
            dialogues: response.data.dialogues || []
          }
        }));
        
        // 第一条音频由后台自动生成，无需前端主动请求
        // 等待AUDIO_READY消息通知第一条音频生成完成
      } else {
        // 处理失败响应
        let errorMessage = response.error || '生成播客失败';
        
        setState(prev => ({
          ...prev,
          error: errorMessage,
          errorDetails: response.errorDetails || null
        }));
        return; // 直接返回，不抛出异常
      }
    } catch (error) {
      console.error('生成播客失败:', error);
      
      // 构建详细的错误信息用于展示
      let displayError = error instanceof Error ? error.message : '生成播客失败';
      
      setState(prev => ({
        ...prev,
        error: displayError,
        errorDetails: null
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
   * 请求指定索引的音频
   */
  const requestAudio = async (sessionId: string, index: number): Promise<void> => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.GET_AUDIO,
        data: {
          sessionId,
          index,
          direction: 'current'
        }
      });
      
      console.log(`第${index + 1}条音频请求响应:`, response);
      
      if (response && response.success) {
        if (response.audioUrl) {
          // 音频已生成完成，立即更新状态
          setState(prev => {
            if (prev.podcastSession && prev.podcastSession.sessionId === sessionId && index === prev.podcastSession.currentIndex) {
              return {
                ...prev,
                podcastSession: {
                  ...prev.podcastSession,
                  currentAudio: response.audioUrl
                }
              };
            }
            return prev;
          });
          console.log(`第${index + 1}条音频已就绪`);
        } else {
          // 音频正在生成中，等待AUDIO_READY消息
          console.log(`第${index + 1}条音频正在生成中，等待完成通知`);
        }
      } else {
        console.error(`第${index + 1}条音频请求失败:`, response?.error);
        // 显示错误信息
        setState(prev => ({
          ...prev,
          ttsError: `第${index + 1}条音频请求失败: ${response?.error || '未知错误'}`
        }));
      }
    } catch (error) {
      console.error(`请求第${index + 1}条音频失败:`, error);
      setState(prev => ({
        ...prev,
        ttsError: `第${index + 1}条音频请求失败: ${error instanceof Error ? error.message : '网络错误'}`
      }));
    }
  };

  /**
   * 预加载下一条音频
   */
  const loadNextAudio = async (): Promise<void> => {
    if (!state.podcastSession) return;
    
    const nextIndex = state.podcastSession.currentIndex + 1;
    if (nextIndex >= state.podcastSession.totalDialogues) return;
    
    await requestAudio(state.podcastSession.sessionId, nextIndex);
  };

  /**
   * 播放上一条
   */
  const playPrevious = async (): Promise<void> => {
    if (!state.podcastSession || state.podcastSession.currentIndex <= 0) return;
    
    const newIndex = state.podcastSession.currentIndex - 1;
    
    // 立即更新界面显示（文本切换立即发生）
    setState(prev => ({
      ...prev,
      podcastSession: prev.podcastSession ? {
        ...prev.podcastSession,
        currentIndex: newIndex,
        currentAudio: null, // 清空音频，等待新音频加载
        isPlaying: false
      } : null
    }));
    
    // 异步请求音频
    await requestAudio(state.podcastSession.sessionId, newIndex);
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
    
    // 立即更新界面显示（文本切换立即发生）
    setState(prev => ({
      ...prev,
      podcastSession: prev.podcastSession ? {
        ...prev.podcastSession,
        currentIndex: newIndex,
        currentAudio: null, // 清空音频，等待新音频加载
        isPlaying: false
      } : null
    }));
    
    // 异步请求当前音频
    await requestAudio(state.podcastSession.sessionId, newIndex);
    
    // 预加载下一条音频
    await loadNextAudio();
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
    
    // 立即更新界面显示，准备自动播放下一段
    setState(prev => ({
      ...prev,
      podcastSession: prev.podcastSession ? {
        ...prev.podcastSession,
        currentIndex: newIndex,
        currentAudio: null, // 清空音频，等待新音频加载
        isPlaying: true // 标记为自动播放状态
      } : null
    }));
    
    // 异步请求当前音频
    await requestAudio(state.podcastSession.sessionId, newIndex);
    
    // 预加载下一条音频
    await loadNextAudio();
  };

  /**
   * 停止播放
   */
  const stopPlayback = (): void => {
    setState(prev => ({ ...prev, podcastSession: null }));
  };

  /**
   * 处理页面内容输入框变化
   */
  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const newContent = event.target.value;
    setState(prev => ({
      ...prev,
      pageContent: prev.pageContent ? { ...prev.pageContent, content: newContent } : null
    }));
  };

  /**
   * 处理AI模型选择变化
   */
  const handleAgentChange = async (event: React.ChangeEvent<HTMLSelectElement>): Promise<void> => {
    const selectedAgentId = event.target.value;
    const selectedAgent = state.allAgents.find(agent => agent.id === selectedAgentId);

    if (selectedAgent) {
      setState(prev => ({
        ...prev,
        currentAgent: selectedAgent
      }));
      // 保存新的默认Agent ID到存储
      const settings = await StorageManager.getAppSettings();
      await StorageManager.saveAppSettings({ ...settings, defaultAgentId: selectedAgent.id });
    } else if (selectedAgentId === '') {
      // 处理“未配置”选项，即没有选择任何Agent
      setState(prev => ({
        ...prev,
        currentAgent: null
      }));
      const settings = await StorageManager.getAppSettings();
      await StorageManager.saveAppSettings({ ...settings, defaultAgentId: '' });
    }
  };

  /**
   * 处理音色选择变化
   */
  const handleVoiceChange = async (event: React.ChangeEvent<HTMLSelectElement>, role: 'A' | 'B'): Promise<void> => {
    const selectedVoiceId = event.target.value;
    const selectedVoice = state.allTTSConfigs.find(tts => tts.id === selectedVoiceId);

    setState(prev => {
      const newVoices = { ...prev.currentVoices };
      if (role === 'A') {
        newVoices.voiceA = selectedVoice || null;
      } else {
        newVoices.voiceB = selectedVoice || null;
      }
      return {
        ...prev,
        currentVoices: newVoices
      };
    });

    // 保存新的默认TTS ID到存储
    const settings = await StorageManager.getAppSettings();
    if (role === 'A') {
      await StorageManager.saveAppSettings({ ...settings, voiceAConfigId: selectedVoice?.id || '' });
    } else {
      await StorageManager.saveAppSettings({ ...settings, voiceBConfigId: selectedVoice?.id || '' });
    }
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
        <div className="error ai-error">
          <div className="error-content scrollable">
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
              {state.error}
            </div>
            {state.errorDetails && (
              <div style={{ 
                fontSize: '12px', 
                color: '#666',
                backgroundColor: '#f8f9fa',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>详细信息：</div>
                
                {/* 优先显示AI返回的原始内容 */}
                 {state.errorDetails?.originalScript && (
                   <div style={{ marginBottom: '12px' }}>
                     <div style={{ fontWeight: 'bold', color: '#d73527', marginBottom: '4px' }}>AI返回的原始内容：</div>
                     <div style={{
                       fontFamily: 'monospace',
                       whiteSpace: 'pre-wrap',
                       wordBreak: 'break-all',
                       backgroundColor: '#fff',
                       padding: '8px',
                       border: '1px solid #ddd',
                       borderRadius: '4px',
                       maxHeight: '200px',
                       overflow: 'auto'
                     }}>
                       {state.errorDetails.originalScript}
                     </div>
                     {state.errorDetails?.parseError && (
                       <div style={{ marginTop: '4px', color: '#d73527', fontSize: '11px' }}>
                         解析错误：{state.errorDetails.parseError}
                       </div>
                     )}
                   </div>
                 )}
                 
                 {/* 显示API响应数据 */}
                 {state.errorDetails?.apiResponse && (
                   <div style={{ marginBottom: '12px' }}>
                     <div style={{ fontWeight: 'bold', color: '#d73527', marginBottom: '4px' }}>API响应数据：</div>
                     <div style={{
                       fontFamily: 'monospace',
                       whiteSpace: 'pre-wrap',
                       wordBreak: 'break-all',
                       backgroundColor: '#fff',
                       padding: '8px',
                       border: '1px solid #ddd',
                       borderRadius: '4px'
                     }}>
                       {JSON.stringify(state.errorDetails.apiResponse, null, 2)}
                     </div>
                   </div>
                 )}
                 
                 {/* 显示其他详细信息 */}
                 <div style={{
                   fontFamily: 'monospace',
                   whiteSpace: 'pre-wrap',
                   wordBreak: 'break-all',
                   fontSize: '11px',
                   color: '#888'
                 }}>
                   {state.errorDetails?.timestamp && (
                     <div>时间：{state.errorDetails.timestamp}</div>
                   )}
                   {state.errorDetails?.context && (
                     <div>上下文：{state.errorDetails.context}</div>
                   )}
                   {state.errorDetails?.statusCode && (
                     <div>状态码：{state.errorDetails.statusCode}</div>
                   )}
                 </div>
              </div>
            )}
          </div>
          <button 
            className="error-close-btn"
            onClick={() => setState(prev => ({ ...prev, error: null, errorDetails: null }))}
            title="关闭错误提示"
          >
            ×
          </button>
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
          <select
            className="config-select"
            value={state.currentAgent?.id || ''}
            onChange={handleAgentChange}
            title="选择AI模型"
          >
            {state.allAgents.length === 0 ? (
              <option value="">未配置（点击右下角设置）</option>
            ) : (
              state.allAgents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.supportsImages && '📷 '}
                  {agent.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="config-item">
          <span className="config-label">🎵 角色A:</span>
          <select
            className="config-select"
            value={state.currentVoices.voiceA?.id || ''}
            onChange={(e) => handleVoiceChange(e, 'A')}
            title="选择角色A音色"
          >
            {state.allTTSConfigs.length === 0 ? (
              <option value="">未配置（点击右下角设置）</option>
            ) : (
              state.allTTSConfigs.map(tts => (
                <option key={tts.id} value={tts.id}>
                  {tts.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="config-item">
          <span className="config-label">🎵 角色B:</span>
          <select
            className="config-select"
            value={state.currentVoices.voiceB?.id || ''}
            onChange={(e) => handleVoiceChange(e, 'B')}
            title="选择角色B音色"
          >
            {state.allTTSConfigs.length === 0 ? (
              <option value="">未配置（点击右下角设置）</option>
            ) : (
              state.allTTSConfigs.map(tts => (
                <option key={tts.id} value={tts.id}>
                  {tts.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
    );
  };

  /**
   * 渲染页面信息
   */
  /**
   * 移除图片
   */
  const removeImage = (indexToRemove: number): void => {
    setState(prev => {
      if (!prev.pageContent || !prev.pageContent.images) return prev;
      const updatedImages = prev.pageContent.images.filter((_, index) => index !== indexToRemove);
      return {
        ...prev,
        pageContent: {
          ...prev.pageContent,
          images: updatedImages
        }
      };
    });
  };

  /**
   * 添加图片
   */
  const addImage = (): void => {
    const imageUrl = prompt('请输入图片链接：');
    if (imageUrl) {
      // 这里需要调用content-script中的isValidImageUrl函数进行验证
      // 暂时先简单判断，后续考虑通过消息传递调用content-script中的函数
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        setState(prev => {
          if (!prev.pageContent) return prev;
          const newImage = { src: imageUrl, alt: '' };
          return {
            ...prev,
            pageContent: {
              ...prev.pageContent,
              images: [...(prev.pageContent.images || []), newImage]
            }
          };
        });
      } else {
        alert('请输入有效的图片链接（以http://或https://开头）');
      }
    }
  };

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
        <textarea
          className="page-content-textarea"
          value={state.pageContent.content}
          onChange={handleContentChange}
          placeholder="页面内容"
        />
        <div className="images-section">
            <h4 className="images-title">页面图片 ({state.pageContent.images.length == 0 ? '未识别到图片，可手动添加' : state.pageContent.images.length}) 
            </h4>
            {state.currentAgent?.supportsImages &&
               state.pageContent.images.length > (state.currentAgent?.maxImageCount || 10) && (
                <span style={{ fontSize: '12px', color: '#ff4d4f', marginLeft: '10px' }}>
                  超过图片理解上限{state.currentAgent?.maxImageCount || 10}，可手动删除或自动取前{state.currentAgent?.maxImageCount || 10}
                </span>
              )}
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
                  <button 
                    className="delete-image-btn"
                    onClick={() => removeImage(index)}
                  >
                    x
                  </button>
                </div>
              ))}
              <div className="add-image-item">
                <button className="add-image-btn" onClick={addImage}>+</button>
              </div>
            </div>
          </div>
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
   * 渲染支持区域
   */
  const renderSupportSection = (): JSX.Element => {
    return (
      <div className="support-section">
        <div className="support-item github-support">
          <div className="support-icon">⭐</div>
          <div className="support-content">
            <div className="support-title">喜欢这个项目？</div>
            <a 
              href="https://github.com/Bellzs/RaiPodcast" 
              target="_blank" 
              rel="noopener noreferrer"
              className="support-link"
            >
              🚀 GitHub Star
            </a>
          </div>
        </div>
        
        <div className="support-item sponsor-support">
          <div className="sponsor-header">
            <div className="support-icon">💝</div>
            <div className="support-content">
              <div className="support-title">支持开发者</div>
              <div className="support-description">赏ta一杯蜜雪冰城~</div>
            </div>
          </div>
          <div className="qr-code-container">
            <img 
              src="../assets/alipay.png" 
              alt="赞助二维码" 
              className="qr-code"
            />
          </div>
        </div>
      </div>
    );
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
              fontSize: '16px',
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
        <img src="../assets/icon-128.png" alt="RaiPodcast Logo" className="popup-logo" />
        <h1 className="popup-title">RaiPodcast</h1>
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
            {renderSupportSection()}
          </>
        )}
      </div>

      {/* 底部栏 */}
      <div className="popup-footer">
        <span className="version-info">v{packageJson.version}</span>
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
    </div>
  );
};

export default Popup;