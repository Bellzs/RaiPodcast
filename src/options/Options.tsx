import React, { useState, useEffect } from 'react';
import { AgentConfig, TTSConfig } from '@/shared/types';
import { StorageManager } from '@/shared/storage';
import { DEFAULT_AGENT_CONFIG, DEFAULT_TTS_CONFIG } from '@/shared/constants';

interface OptionsState {
  agentConfigs: AgentConfig[];
  ttsConfigs: { voiceA: TTSConfig; voiceB: TTSConfig };
  loading: boolean;
  saving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

const Options: React.FC = () => {
  const [state, setState] = useState<OptionsState>({
    agentConfigs: [],
    ttsConfigs: {
      voiceA: { ...DEFAULT_TTS_CONFIG, id: 'voiceA', name: '角色A - 男声' },
      voiceB: { ...DEFAULT_TTS_CONFIG, id: 'voiceB', name: '角色B - 女声' }
    },
    loading: true,
    saving: false,
    message: null
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  /**
   * 加载配置
   */
  const loadConfigs = async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const [agentConfigs, ttsConfigs] = await Promise.all([
        StorageManager.getAgentConfigs(),
        StorageManager.getTTSConfigs()
      ]);
      
      setState(prev => ({
        ...prev,
        agentConfigs: agentConfigs.length > 0 ? agentConfigs : [DEFAULT_AGENT_CONFIG],
        ttsConfigs,
        loading: false
      }));
    } catch (error) {
      console.error('加载配置失败:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        message: { type: 'error', text: '加载配置失败' }
      }));
    }
  };

  /**
   * 保存配置
   */
  const saveConfigs = async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, saving: true, message: null }));
      
      await Promise.all([
        StorageManager.saveAgentConfigs(state.agentConfigs),
        StorageManager.saveTTSConfigs(state.ttsConfigs)
      ]);
      
      setState(prev => ({
        ...prev,
        saving: false,
        message: { type: 'success', text: '配置保存成功！' }
      }));
      
      // 3秒后清除消息
      setTimeout(() => {
        setState(prev => ({ ...prev, message: null }));
      }, 3000);
    } catch (error) {
      console.error('保存配置失败:', error);
      setState(prev => ({
        ...prev,
        saving: false,
        message: { type: 'error', text: '保存配置失败' }
      }));
    }
  };

  /**
   * 更新Agent配置
   */
  const updateAgentConfig = (field: keyof AgentConfig, value: string | number): void => {
    setState(prev => ({
      ...prev,
      agentConfigs: prev.agentConfigs.map((config, index) => 
        index === 0 ? { ...config, [field]: value } : config
      )
    }));
  };

  /**
   * 更新TTS配置
   */
  const updateTTSConfig = (voice: 'voiceA' | 'voiceB', field: keyof TTSConfig, value: string): void => {
    setState(prev => ({
      ...prev,
      ttsConfigs: {
        ...prev.ttsConfigs,
        [voice]: {
          ...prev.ttsConfigs[voice],
          [field]: value
        }
      }
    }));
  };

  /**
   * 渲染状态消息
   */
  const renderMessage = (): JSX.Element | null => {
    if (!state.message) return null;
    
    return (
      <div className={`status-message status-${state.message.type}`}>
        {state.message.text}
      </div>
    );
  };

  /**
   * 渲染AI配置部分
   */
  const renderAgentConfig = (): JSX.Element => {
    const config = state.agentConfigs[0] || DEFAULT_AGENT_CONFIG;
    
    return (
      <div className="config-section">
        <h2 className="section-title">
          <span className="section-icon">🤖</span>
          AI模型配置
        </h2>
        <p className="section-description">
          配置用于生成播客对话的AI模型，支持OpenAI兼容的API接口。
        </p>
        
        <div className="form-group">
          <label className="form-label">模型名称</label>
          <input
            type="text"
            className="form-input"
            value={config.name}
            onChange={(e) => updateAgentConfig('name', e.target.value)}
            placeholder="例如：GPT-4播客专家"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">API地址</label>
          <input
            type="url"
            className="form-input"
            value={config.apiUrl}
            onChange={(e) => updateAgentConfig('apiUrl', e.target.value)}
            placeholder="例如：https://api.openai.com/v1/chat/completions"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">API密钥</label>
          <input
            type="password"
            className="form-input"
            value={config.apiKey}
            onChange={(e) => updateAgentConfig('apiKey', e.target.value)}
            placeholder="输入您的API密钥"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">模型名称</label>
          <input
            type="text"
            className="form-input"
            value={config.model}
            onChange={(e) => updateAgentConfig('model', e.target.value)}
            placeholder="例如：gpt-4"
          />
        </div>
        
        <div className="form-group">
          <label className="form-label">系统提示词</label>
          <textarea
            className="form-textarea"
            value={config.systemPrompt}
            onChange={(e) => updateAgentConfig('systemPrompt', e.target.value)}
            placeholder="输入系统提示词，定义AI的角色和行为"
            rows={4}
          />
        </div>
      </div>
    );
  };

  /**
   * 渲染TTS配置部分
   */
  const renderTTSConfig = (): JSX.Element => {
    return (
      <div className="config-section">
        <h2 className="section-title">
          <span className="section-icon">🎵</span>
          语音合成配置
        </h2>
        <p className="section-description">
          配置两种不同的音色用于播客对话，支持自定义TTS API。
        </p>
        
        {/* 角色A配置 */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>👨 角色A（主持人）</h3>
          
          <div className="form-group">
            <label className="form-label">音色名称</label>
            <input
              type="text"
              className="form-input"
              value={state.ttsConfigs.voiceA.name}
              onChange={(e) => updateTTSConfig('voiceA', 'name', e.target.value)}
              placeholder="例如：角色A - 男声"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">cURL命令</label>
            <textarea
              className="form-textarea"
              value={state.ttsConfigs.voiceA.curlCommand}
              onChange={(e) => updateTTSConfig('voiceA', 'curlCommand', e.target.value)}
              placeholder="输入完整的cURL命令，使用{text}作为文本占位符"
              rows={3}
            />
          </div>
        </div>
        
        {/* 角色B配置 */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>👩 角色B（嘉宾）</h3>
          
          <div className="form-group">
            <label className="form-label">音色名称</label>
            <input
              type="text"
              className="form-input"
              value={state.ttsConfigs.voiceB.name}
              onChange={(e) => updateTTSConfig('voiceB', 'name', e.target.value)}
              placeholder="例如：角色B - 女声"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">cURL命令</label>
            <textarea
              className="form-textarea"
              value={state.ttsConfigs.voiceB.curlCommand}
              onChange={(e) => updateTTSConfig('voiceB', 'curlCommand', e.target.value)}
              placeholder="输入完整的cURL命令，使用{text}作为文本占位符"
              rows={3}
            />
          </div>
        </div>
      </div>
    );
  };

  if (state.loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <span>正在加载配置...</span>
      </div>
    );
  }

  return (
    <div className="options-container">
      {/* 头部 */}
      <div className="options-header">
        <h1 className="options-title">
          <img src="../assets/icon-128.png" alt="RaiPod Logo" className="options-logo" />
          RaiPod 设置
        </h1>
        <p className="options-description">
          配置AI模型和TTS服务，开始您的播客之旅
        </p>
      </div>

      {/* 内容区域 */}
      <div className="options-content">
        {renderMessage()}
        {renderAgentConfig()}
        {renderTTSConfig()}
        
        {/* 操作按钮 */}
        <div className="btn-group">
          <button
            className="btn btn-primary"
            onClick={saveConfigs}
            disabled={state.saving}
          >
            {state.saving ? '保存中...' : '保存配置'}
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={loadConfigs}
            disabled={state.saving}
          >
            重新加载
          </button>
        </div>
      </div>
    </div>
  );
};

export default Options;