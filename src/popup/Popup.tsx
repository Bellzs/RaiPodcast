import React, { useState, useEffect } from 'react';
import { PageContent } from '@/shared/types';
import { MESSAGE_TYPES } from '@/shared/constants';
import { StorageManager } from '@/shared/storage';

interface PopupState {
  pageContent: PageContent | null;
  loading: boolean;
  error: string | null;
  generating: boolean;
}

const Popup: React.FC = () => {
  const [state, setState] = useState<PopupState>({
    pageContent: null,
    loading: true,
    error: null,
    generating: false
  });

  useEffect(() => {
    initializePopup();
  }, []);

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

      // 请求提取页面内容
      const response = await chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.EXTRACT_CONTENT
      });

      if (response.success) {
        setState(prev => ({
          ...prev,
          pageContent: response.data,
          loading: false
        }));
      } else {
        throw new Error(response.error || '提取内容失败');
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

      if (response.success) {
        console.log('播客生成成功:', response.data);
        // 这里将来会处理生成结果
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
   * 渲染页面信息
   */
  const renderPageInfo = (): JSX.Element => {
    if (!state.pageContent) return <></>;

    return (
      <div className="page-info">
        <h3 className="page-title">{state.pageContent.title}</h3>
        <p className="page-url">{state.pageContent.url}</p>
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
            {renderPageInfo()}
            {renderActions()}
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