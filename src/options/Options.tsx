import React, { useState, useEffect } from 'react';
import { AgentConfig, TTSConfig, AppSettings } from '@/shared/types';
import { StorageManager } from '@/shared/storage';
import { DEFAULT_AGENT_CONFIG, DEFAULT_VOICE_A_CONFIG, DEFAULT_VOICE_B_CONFIG } from '@/shared/constants';

interface ModalData {
  type: 'success' | 'error' | 'test-connection';
  title: string;
  content: string | JSX.Element;
  onConfirm?: () => void;
  confirmText?: string;
  showCancel?: boolean;
}

interface OptionsState {
  agentConfigs: AgentConfig[];
  ttsConfigs: TTSConfig[];
  settings: AppSettings;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  modal: ModalData | null;
  editingAgent: AgentConfig | null;
  editingTTS: TTSConfig | null;
  showApiKeys: { [configId: string]: boolean };
}

const Options: React.FC = () => {
  const [state, setState] = useState<OptionsState>({
    agentConfigs: [],
    ttsConfigs: [],
    settings: { defaultAgentId: '', voiceAConfigId: '', voiceBConfigId: '' },
    loading: true,
    saving: false,
    testing: false,
    message: null,
    modal: null,
    editingAgent: null,
    editingTTS: null,
    showApiKeys: {}
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  /**
   * 显示成功弹窗
   */
  const showSuccessModal = (title: string, content: string, onConfirm?: () => void): void => {
    setState(prev => ({
      ...prev,
      modal: {
        type: 'success',
        title,
        content,
        onConfirm,
        confirmText: '确定',
        showCancel: false
      }
    }));
  };

  /**
   * 显示错误弹窗
   */
  const showErrorModal = (title: string, content: string): void => {
    setState(prev => ({
      ...prev,
      modal: {
        type: 'error',
        title,
        content,
        confirmText: '确定',
        showCancel: false
      }
    }));
  };

  /**
   * 显示测试连接弹窗
   */
  const showTestConnectionModal = (modelName: string, response: string, onSave: () => void): void => {
    const content = (
      <div>
        <div className="test-result-item">
          <span className="test-result-label">模型名称：</span>
          <span className="test-result-value">{modelName}</span>
        </div>
        <div className="test-result-item">
          <span className="test-result-label">连接状态：</span>
          <span className="test-result-value" style={{color: '#52c41a', fontWeight: 500}}>连接成功</span>
        </div>
        <div className="test-result-item">
          <span className="test-result-label">响应内容：</span>
        </div>
        <div className="test-result-value" style={{marginTop: '8px', padding: '8px', background: '#f0f0f0', borderRadius: '4px', fontSize: '13px'}}>
          {response}
        </div>
      </div>
    );
    
    setState(prev => ({
      ...prev,
      modal: {
        type: 'test-connection',
        title: '测试连接成功',
        content,
        onConfirm: onSave,
        confirmText: '保存',
        showCancel: true
      }
    }));
  };

  /**
   * 关闭弹窗
   */
  const closeModal = (): void => {
    setState(prev => ({ ...prev, modal: null }));
  };

  /**
   * 加载配置
   */
  const loadConfigs = async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, loading: true }));
      
      const [agentConfigs, ttsConfigs, settings] = await Promise.all([
        StorageManager.getAgentConfigs(),
        StorageManager.getTTSConfigs(),
        StorageManager.getAppSettings()
      ]);
      
      setState(prev => ({
        ...prev,
        agentConfigs: agentConfigs.length > 0 ? agentConfigs : [DEFAULT_AGENT_CONFIG],
        ttsConfigs: ttsConfigs.length > 0 ? ttsConfigs : [DEFAULT_VOICE_A_CONFIG, DEFAULT_VOICE_B_CONFIG],
        settings,
        loading: false
      }));
    } catch (error) {
      console.error('加载配置失败:', error);
      setState(prev => ({ ...prev, loading: false }));
      showErrorModal('加载失败', '无法加载配置信息，请刷新页面重试。');
    }
  };

  /**
   * 保存配置
   */
  const saveConfigs = async (): Promise<void> => {
    try {
      setState(prev => ({ ...prev, saving: true }));
      
      await Promise.all([
        StorageManager.saveAgentConfigs(state.agentConfigs),
        StorageManager.saveTTSConfigs(state.ttsConfigs),
        StorageManager.saveAppSettings(state.settings)
      ]);
      
      setState(prev => ({ ...prev, saving: false }));
      showSuccessModal('保存成功', '所有配置已成功保存到本地存储。');
    } catch (error) {
      console.error('保存配置失败:', error);
      setState(prev => ({ ...prev, saving: false }));
      showErrorModal('保存失败', '保存配置时发生错误，请重试。');
    }
  };

  /**
   * 添加新的Agent配置
   */
  const addAgentConfig = async (): Promise<void> => {
    try {
      const newConfig: AgentConfig = {
        ...DEFAULT_AGENT_CONFIG,
        id: `agent_${Date.now()}`,
        name: `AI模型 ${state.agentConfigs.length + 1}`
      };
      
      const updatedConfigs = [...state.agentConfigs, newConfig];
      
      // 持久化到本地存储
      await StorageManager.saveAgentConfigs(updatedConfigs);
      
      setState(prev => ({
          ...prev,
          agentConfigs: updatedConfigs,
          editingAgent: newConfig
        }));
        
        showSuccessModal('添加成功', '新的AI模型配置已成功添加。');
    } catch (error) {
      console.error('添加Agent配置失败:', error);
      showErrorModal('添加失败', '添加AI模型配置时发生错误，请重试。');
    }
  };

  /**
   * 删除Agent配置
   */
  const deleteAgentConfig = async (id: string): Promise<void> => {
    try {
      const newConfigs = state.agentConfigs.filter(config => config.id !== id);
      const newSettings = { ...state.settings };
      if (state.settings.defaultAgentId === id) {
        newSettings.defaultAgentId = newConfigs.length > 0 ? newConfigs[0].id : '';
      }
      
      // 持久化到本地存储
      await StorageManager.saveAgentConfigs(newConfigs);
      if (state.settings.defaultAgentId === id) {
        await StorageManager.saveAppSettings(newSettings);
      }
      
      setState(prev => ({
          ...prev,
          agentConfigs: newConfigs,
          settings: newSettings,
          editingAgent: prev.editingAgent?.id === id ? null : prev.editingAgent
        }));
        
        showSuccessModal('删除成功', 'AI模型配置已成功删除。');
    } catch (error) {
      console.error('删除Agent配置失败:', error);
      showErrorModal('删除失败', '删除AI模型配置时发生错误，请重试。');
    }
  };

  /**
   * 更新Agent配置
   */
  const updateAgentConfig = (id: string, field: keyof AgentConfig, value: string | boolean): void => {
    setState(prev => ({
      ...prev,
      agentConfigs: prev.agentConfigs.map(config => 
        config.id === id ? { ...config, [field]: value } : config
      ),
      editingAgent: prev.editingAgent?.id === id ? { ...prev.editingAgent, [field]: value } : prev.editingAgent
    }));
  };

  /**
   * 添加新的TTS配置
   */
  const addTTSConfig = async (): Promise<void> => {
    try {
      const newConfig: TTSConfig = {
        ...DEFAULT_VOICE_A_CONFIG,
        id: `tts_${Date.now()}`,
        name: `语音配置 ${state.ttsConfigs.length + 1}`
      };
      
      const updatedConfigs = [...state.ttsConfigs, newConfig];
      
      // 持久化到本地存储
      await StorageManager.saveTTSConfigs(updatedConfigs);
      
      setState(prev => ({
        ...prev,
        ttsConfigs: updatedConfigs,
        editingTTS: newConfig
      }));
      
      showSuccessModal('添加成功', '新的TTS配置已成功添加。');
    } catch (error) {
      console.error('添加TTS配置失败:', error);
      showErrorModal('添加失败', '添加TTS配置时发生错误，请重试。');
    }
  };

  /**
   * 删除TTS配置
   */
  const deleteTTSConfig = async (id: string): Promise<void> => {
    try {
      const newConfigs = state.ttsConfigs.filter(config => config.id !== id);
      const newSettings = { ...state.settings };
      let settingsChanged = false;
      
      if (state.settings.voiceAConfigId === id) {
        newSettings.voiceAConfigId = newConfigs.length > 0 ? newConfigs[0].id : '';
        settingsChanged = true;
      }
      if (state.settings.voiceBConfigId === id) {
        newSettings.voiceBConfigId = newConfigs.length > 0 ? newConfigs[0].id : '';
        settingsChanged = true;
      }
      
      // 持久化到本地存储
      await StorageManager.saveTTSConfigs(newConfigs);
      if (settingsChanged) {
        await StorageManager.saveAppSettings(newSettings);
      }
      
      setState(prev => ({
        ...prev,
        ttsConfigs: newConfigs,
        settings: newSettings,
        editingTTS: prev.editingTTS?.id === id ? null : prev.editingTTS
      }));
      
      showSuccessModal('删除成功', 'TTS配置已成功删除。');
    } catch (error) {
      console.error('删除TTS配置失败:', error);
      showErrorModal('删除失败', '删除TTS配置时发生错误，请重试。');
    }
  };

  /**
   * 更新TTS配置（仅内存，不保存）
   */
  const updateTTSConfig = (id: string, field: keyof TTSConfig, value: string): void => {
    setState(prev => ({
      ...prev,
      ttsConfigs: prev.ttsConfigs.map(config => 
        config.id === id ? { ...config, [field]: value } : config
      ),
      editingTTS: prev.editingTTS?.id === id ? { ...prev.editingTTS, [field]: value } : prev.editingTTS
    }));
  };

  /**
   * 更新应用设置
   */
  const updateSettings = async (field: keyof AppSettings, value: string): Promise<void> => {
    try {
      const updatedSettings = { ...state.settings, [field]: value };
      
      // 持久化到本地存储
      await StorageManager.saveAppSettings(updatedSettings);
      
      setState(prev => ({
        ...prev,
        settings: updatedSettings
      }));
    } catch (error) {
      console.error('更新应用设置失败:', error);
      showErrorModal('更新失败', '更新应用设置时发生错误，请重试。');
    }
  };

  /**
   * 验证Agent配置是否完整
   */
  const validateAgentConfig = (config: AgentConfig): string | null => {
    if (!config.name?.trim()) return '模型名称不能为空';
    if (!config.apiUrl?.trim()) return 'API地址不能为空';
    if (!config.apiKey?.trim()) return 'API密钥不能为空';
    if (!config.model?.trim()) return '模型名称不能为空';
    return null;
  };

  /**
   * 验证TTS配置是否完整
   */
  const validateTTSConfig = (config: TTSConfig): string | null => {
    if (!config.name?.trim()) return '音色名称不能为空';
    if (!config.curlCommand?.trim()) return 'cURL命令不能为空';
    if (!config.curlCommand.includes('{text}')) return 'cURL命令必须包含{text}占位符';
    return null;
  };

  /**
   * 测试Agent连接
   */
  const testAgentConnection = async (config: AgentConfig): Promise<void> => {
    // 验证配置
    const validationError = validateAgentConfig(config);
    if (validationError) {
      alert(`配置验证失败：${validationError}`);
      return;
    }

    setState(prev => ({ ...prev, testing: true }));
    
    try {
      const requestBody = {
        model: config.model,
        messages: [{
          role: 'user',
          content: '请回复：测试连接成功'
        }],
        stream: false,
        "enable_thinking": false,
      };

      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content || '无响应内容';
        setState(prev => ({ ...prev, testing: false }));
        
        showTestConnectionModal(config.name, reply, async () => {
          closeModal();
          await saveAgentConfig();
        });
      } else {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // 如果无法解析JSON，使用原始错误文本
          if (errorText) {
            errorMessage = errorText;
          }
        }
        
        setState(prev => ({ ...prev, testing: false }));
        showErrorModal('连接测试失败', `模型：${config.name}\n错误：${errorMessage}`);
      }
    } catch (error) {
      setState(prev => ({ ...prev, testing: false }));
      showErrorModal('连接测试失败', `模型：${config.name}\n错误：${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  /**
   * 应用Agent配置（设为默认）
   */
  const applyAgentConfig = async (configId: string): Promise<void> => {
    try {
      // 查找要设置为默认的配置
      const targetConfig = state.agentConfigs.find(config => config.id === configId);
      if (!targetConfig) {
        showErrorModal('设置失败', '未找到指定的模型配置。');
        return;
      }
      
      // 验证必要的模型参数
      if (!targetConfig.apiUrl || !targetConfig.apiKey || !targetConfig.model) {
        showErrorModal('设置失败', '模型配置不完整，请确保API地址、API密钥和模型名称都已填写。');
        return;
      }
      
      const updatedSettings = { ...state.settings, defaultAgentId: configId };
      
      // 持久化到本地存储
      await StorageManager.saveAppSettings(updatedSettings);
      
      setState(prev => ({
          ...prev,
          settings: updatedSettings
        }));
        
        showSuccessModal('设置成功', '已成功设置为默认模型。');
    } catch (error) {
      console.error('设置默认模型失败:', error);
      showErrorModal('设置失败', '设置默认模型时发生错误，请重试。');
    }
  };

  /**
   * 保存Agent配置
   */
  const saveAgentConfig = async (): Promise<void> => {
    if (state.editingAgent) {
      // 验证配置
      const validationError = validateAgentConfig(state.editingAgent);
      if (validationError) {
        alert(`保存失败：${validationError}`);
        return;
      }

      try {
        // 更新配置列表
        const updatedConfigs = state.agentConfigs.map(config => 
          config.id === state.editingAgent!.id ? state.editingAgent! : config
        );
        
        // 持久化到本地存储
        await StorageManager.saveAgentConfigs(updatedConfigs);
        
        setState(prev => ({
          ...prev,
          agentConfigs: updatedConfigs,
          editingAgent: null
        }));
        
        showSuccessModal('保存成功', 'AI模型配置已成功保存。');
      } catch (error) {
        console.error('保存Agent配置失败:', error);
        showErrorModal('保存失败', '保存AI模型配置时发生错误，请重试。');
      }
    }
  };

  /**
   * 保存TTS配置
   */
  const saveTTSConfig = async (): Promise<void> => {
    if (state.editingTTS) {
      // 验证配置
      const validationError = validateTTSConfig(state.editingTTS);
      if (validationError) {
        alert(`保存失败：${validationError}`);
        return;
      }

      try {
        // 更新配置列表
        const updatedConfigs = state.ttsConfigs.map(config => 
          config.id === state.editingTTS!.id ? state.editingTTS! : config
        );
        
        // 持久化到本地存储
        await StorageManager.saveTTSConfigs(updatedConfigs);
        
        setState(prev => ({
          ...prev,
          ttsConfigs: updatedConfigs,
          editingTTS: null
        }));
        
        showSuccessModal('保存成功', '语音合成配置已成功保存。');
      } catch (error) {
        console.error('保存TTS配置失败:', error);
        showErrorModal('保存失败', '保存语音合成配置时发生错误，请重试。');
      }
    }
  };

  /**
   * 切换API密钥显示状态
   */
  const toggleApiKeyVisibility = (configId: string): void => {
    setState(prev => ({
      ...prev,
      showApiKeys: {
        ...prev.showApiKeys,
        [configId]: !prev.showApiKeys[configId]
      }
    }));
  };

  /**
   * 渲染弹窗
   */
  const renderModal = (): JSX.Element | null => {
    if (!state.modal) return null;
    
    const { type, title, content, onConfirm, confirmText = '确定', showCancel = false } = state.modal;
    
    return (
      <div className="modal-overlay" onClick={closeModal}>
        <div className={`modal-container ${type === 'test-connection' ? 'test-connection-modal' : ''}`} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className={`modal-icon ${type === 'test-connection' ? 'success' : type}`}>
              {type === 'success' || type === 'test-connection' ? '✓' : '✕'}
            </div>
            <h3 className="modal-title">{title}</h3>
          </div>
          <div className="modal-content">
            {typeof content === 'string' ? content : content}
          </div>
          <div className="modal-actions">
            {showCancel && (
              <button className="modal-btn modal-btn-secondary" onClick={closeModal}>
                取消
              </button>
            )}
            <button 
              className={`modal-btn ${type === 'test-connection' ? 'modal-btn-success' : 'modal-btn-primary'}`}
              onClick={() => {
                if (onConfirm) {
                  onConfirm();
                } else {
                  closeModal();
                }
              }}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * 渲染状态消息（保留作为备用）
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
   * 导出配置到文件
   */
  const exportConfig = (): void => {
    try {
      const configData = {
        agentConfigs: state.agentConfigs,
        ttsConfigs: state.ttsConfigs,
        settings: state.settings,
        exportTime: new Date().toISOString(),
        version: '1.0'
      };
      
      const dataStr = JSON.stringify(configData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = `raipodcast-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccessModal('导出成功', '配置文件已成功导出到下载文件夹。');
    } catch (error) {
      console.error('导出配置失败:', error);
      showErrorModal('导出失败', '导出配置时发生错误，请重试。');
    }
  };

  /**
   * 从文件导入配置
   */
  const importConfig = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const configData = JSON.parse(e.target?.result as string);
        
        // 验证配置数据格式
        if (!configData.agentConfigs || !configData.ttsConfigs || !configData.settings) {
          throw new Error('配置文件格式不正确');
        }
        
        // 显示确认弹窗
        const content = (
          <div>
            <p>即将导入以下配置：</p>
            <ul style={{ textAlign: 'left', margin: '8px 0' }}>
              <li>AI模型配置：{configData.agentConfigs.length} 个</li>
              <li>语音合成配置：{configData.ttsConfigs.length} 个</li>
              <li>导出时间：{configData.exportTime ? new Date(configData.exportTime).toLocaleString() : '未知'}</li>
            </ul>
            <p style={{ color: '#dc3545', fontSize: '13px' }}>⚠️ 导入将覆盖当前所有配置，请确认操作。</p>
          </div>
        );
        
        setState(prev => ({
          ...prev,
          modal: {
            type: 'success',
            title: '确认导入配置',
            content,
            onConfirm: () => {
              setState(prev => ({
                ...prev,
                agentConfigs: configData.agentConfigs,
                ttsConfigs: configData.ttsConfigs,
                settings: configData.settings,
                modal: null
              }));
              showSuccessModal('导入成功', '配置已成功导入，请记得保存配置。');
            },
            confirmText: '确认导入',
            showCancel: true
          }
        }));
        
      } catch (error) {
        console.error('导入配置失败:', error);
        showErrorModal('导入失败', '配置文件格式错误或损坏，请检查文件。');
      }
    };
    
    reader.readAsText(file);
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  /**
   * 渲染Agent配置部分
   */
  const renderAgentConfig = (): JSX.Element => {
    return (
      <div className="config-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0px' }}>
          <div>
            <h2 className="section-title">
              <span className="section-icon">🤖</span>
              AI模型配置
            </h2>
            <p className="section-description">
              配置您的AI模型API，支持OpenAI风格的API。
            </p>
          </div>
          <button className="btn btn-secondary" onClick={addAgentConfig}>
            添加模型
          </button>
        </div>
        
        {/* AI模型推荐提示 */}
          <div style={{ 
            marginBottom: '8px', 
            padding: '8px 12px', 
            backgroundColor: '#e8f5e8', 
            border: '1px solid #c3e6c3', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#2d5a2d',
            lineHeight: '1.4'
          }}>
          <span style={{ fontWeight: '600' }}>💡 提醒：</span>
          支持通义千问、DeepSeek、智普AI等OpenAI风格接口，智普AI提供<b>免费</b>的基础大模型（效果一般）
          <a href="https://open.bigmodel.cn/pricing" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'none', marginLeft: '4px' }}>
            查看详情 ↗
          </a>
        </div>
        
        {/* 默认模型选择 */}
        <div className="form-group">
          <label className="form-label">默认AI模型</label>
          <select
            className="form-input"
            value={state.settings.defaultAgentId}
            onChange={(e) => updateSettings('defaultAgentId', e.target.value)}
          >
            <option value="">请选择默认模型</option>
            {state.agentConfigs.map(config => (
              <option key={config.id} value={config.id}>{config.name}</option>
            ))}
          </select>
        </div>
        
        {/* 模型列表 */}
        <div style={{ marginTop: '24px' }}>
          {state.agentConfigs.map((config, index) => (
            <div key={config.id} className="config-item" style={{ 
              border: '1px solid #e0e0e0', 
              borderRadius: '8px', 
              padding: '16px', 
              marginBottom: '16px',
              backgroundColor: state.settings.defaultAgentId === config.id ? '#f0f8ff' : '#fff'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>
                  {config.name || `AI模型 ${index + 1}`}
                  {state.settings.defaultAgentId === config.id && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#007bff' }}>(默认)</span>
                  )}
                  {config.supportsImages && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#52c41a', backgroundColor: '#f6ffed', padding: '2px 6px', borderRadius: '4px', border: '1px solid #b7eb8f' }}>📷 支持图片</span>
                  )}
                </h3>
                <div>
                  <button 
                    className="btn btn-small" 
                    onClick={() => setState(prev => ({ 
                      ...prev, 
                      editingAgent: prev.editingAgent?.id === config.id ? null : config 
                    }))}
                    style={{ marginRight: '8px' }}
                  >
                    {state.editingAgent?.id === config.id ? '收起' : '展开'}
                  </button>
                  {state.agentConfigs.length > 1 && (
                    <button 
                      className="btn btn-small btn-danger" 
                      onClick={() => deleteAgentConfig(config.id)}
                      style={{ marginRight: '8px' }}
                    >
                      删除
                    </button>
                  )}
                  {state.settings.defaultAgentId !== config.id && (
                    <button 
                      className="btn btn-small btn-primary" 
                      onClick={() => applyAgentConfig(config.id)}
                    >
                      设为默认
                    </button>
                  )}
                </div>
              </div>
              
              {state.editingAgent?.id === config.id && (
                <div>
                  <div className="form-group">
                    <label className="form-label">模型名称</label>
                    <input
                      type="text"
                      className="form-input"
                      value={config.name}
                      onChange={(e) => updateAgentConfig(config.id, 'name', e.target.value)}
                      placeholder="例如：GPT-4"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">API地址</label>
                    <input
                      type="url"
                      className="form-input"
                      value={config.apiUrl}
                      onChange={(e) => updateAgentConfig(config.id, 'apiUrl', e.target.value)}
                      placeholder="https://api.openai.com/v1/chat/completions"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">API密钥</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={state.showApiKeys[config.id] ? "text" : "password"}
                        className="form-input"
                        value={config.apiKey}
                        onChange={(e) => updateAgentConfig(config.id, 'apiKey', e.target.value)}
                        placeholder="sk-..."
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => toggleApiKeyVisibility(config.id)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '16px',
                          color: '#666',
                          padding: '4px'
                        }}
                        title={state.showApiKeys[config.id] ? '隐藏密钥' : '显示密钥'}
                      >
                        {state.showApiKeys[config.id] ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">模型名称</label>
                    <input
                      type="text"
                      className="form-input"
                      value={config.model}
                      onChange={(e) => updateAgentConfig(config.id, 'model', e.target.value)}
                      placeholder="gpt-4"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">系统提示词</label>
                    <textarea
                      className="form-textarea"
                      value={config.systemPrompt}
                      onChange={(e) => updateAgentConfig(config.id, 'systemPrompt', e.target.value)}
                      placeholder="定义AI的角色和行为..."
                      rows={4}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={config.supportsImages || false}
                        onChange={(e) => updateAgentConfig(config.id, 'supportsImages', e.target.checked)}
                        style={{ margin: 0 }}
                      />
                      支持图片理解（多模态）
                    </label>
                    <p style={{ fontSize: '12px', color: '#666', margin: '4px 0 0 0' }}>
                      启用后将在生成播客时同时发送网页中的图片内容
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => testAgentConnection(config)}
                      disabled={state.testing}
                    >
                      {state.testing ? '测试中...' : '测试连接'}
                    </button>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => saveAgentConfig()}
                    >
                      保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0px' }}>
          <div>
            <h2 className="section-title">
              <span className="section-icon">🎵</span>
              语音合成配置
            </h2>
            <p className="section-description">
              配置多种音色用于播客对话，支持自定义TTS API。
            </p>
          </div>
          <button className="btn btn-secondary" onClick={addTTSConfig}>
            添加音色
          </button>
        </div>
        
        {/* TTS推荐提示 */}
          <div style={{ 
            marginBottom: '8px', 
            padding: '8px 12px', 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffeaa7', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#856404',
            lineHeight: '1.4'
          }}>
          <div>
            <span style={{ fontWeight: '600' }}>💡 提醒：</span>
            明伟数据提供<b>免费</b>TTS API（第三方服务，仅供参考）
            <a href="https://api.tjit.net/doc/103" target="_blank" rel="noopener noreferrer" style={{ color: '#1976d2', textDecoration: 'none', marginLeft: '4px' }}>
              查看文档 ↗
            </a>
          </div>
        </div>
        
        {/* 角色音色选择 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div className="form-group">
            <label className="form-label">👨 角色A（主持人）音色</label>
            <select
              className="form-input"
              value={state.settings.voiceAConfigId}
              onChange={(e) => updateSettings('voiceAConfigId', e.target.value)}
            >
              <option value="">请选择角色A音色</option>
              {state.ttsConfigs.map(config => (
                <option key={config.id} value={config.id}>{config.name}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label className="form-label">👩 角色B（嘉宾）音色</label>
            <select
              className="form-input"
              value={state.settings.voiceBConfigId}
              onChange={(e) => updateSettings('voiceBConfigId', e.target.value)}
            >
              <option value="">请选择角色B音色</option>
              {state.ttsConfigs.map(config => (
                <option key={config.id} value={config.id}>{config.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        {/* TTS配置列表 */}
        <div style={{ marginTop: '24px' }}>
          {state.ttsConfigs.map((config, index) => {
            const isVoiceA = state.settings.voiceAConfigId === config.id;
            const isVoiceB = state.settings.voiceBConfigId === config.id;
            const isAssigned = isVoiceA || isVoiceB;
            
            return (
              <div key={config.id} className="config-item" style={{ 
                border: '1px solid #e0e0e0', 
                borderRadius: '8px', 
                padding: '16px', 
                marginBottom: '16px',
                backgroundColor: isAssigned ? '#f0f8ff' : '#fff'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', margin: 0 }}>
                    {config.name || `语音配置 ${index + 1}`}
                    {isVoiceA && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#28a745', backgroundColor: '#d4edda', padding: '2px 6px', borderRadius: '4px' }}>(角色A)</span>
                    )}
                    {isVoiceB && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#dc3545', backgroundColor: '#f8d7da', padding: '2px 6px', borderRadius: '4px' }}>(角色B)</span>
                    )}
                  </h3>
                  <div>
                    <button 
                      className="btn btn-small" 
                      onClick={() => setState(prev => ({ 
                        ...prev, 
                        editingTTS: prev.editingTTS?.id === config.id ? null : config 
                      }))}
                      style={{ marginRight: '8px' }}
                    >
                      {state.editingTTS?.id === config.id ? '收起' : '展开'}
                    </button>
                    {state.ttsConfigs.length > 2 && (
                      <button 
                        className="btn btn-small btn-danger" 
                        onClick={() => deleteTTSConfig(config.id)}
                        style={{ marginRight: '8px' }}
                      >
                        删除
                      </button>
                    )}
                    {!isVoiceA && (
                      <button 
                        className="btn btn-small btn-primary" 
                        onClick={() => updateSettings('voiceAConfigId', config.id)}
                        style={{ marginRight: '8px' }}
                      >
                        设为角色A
                      </button>
                    )}
                    {!isVoiceB && (
                      <button 
                        className="btn btn-small btn-primary" 
                        onClick={() => updateSettings('voiceBConfigId', config.id)}
                      >
                        设为角色B
                      </button>
                    )}
                  </div>
                </div>
                
                {state.editingTTS?.id === config.id && (
                  <div>
                    <div className="form-group">
                      <label className="form-label">音色名称</label>
                      <input
                        type="text"
                        className="form-input"
                        value={config.name}
                        onChange={(e) => updateTTSConfig(config.id, 'name', e.target.value)}
                        placeholder="例如：男声 - 磁性"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">cURL命令</label>
                      <textarea
                        className="form-textarea"
                        value={config.curlCommand}
                        onChange={(e) => updateTTSConfig(config.id, 'curlCommand', e.target.value)}
                        placeholder="输入完整的cURL命令，使用{text}作为文本占位符"
                        rows={4}
                        style={{ 
                          fontFamily: 'monospace',
                          width: '100%',
                          resize: 'vertical'
                        }}
                      />
                      <div style={{ 
                        marginTop: '8px', 
                        padding: '12px', 
                        backgroundColor: '#f8f9fa', 
                        border: '1px solid #e9ecef', 
                        borderRadius: '4px',
                        fontSize: '13px',
                        color: '#6c757d'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '6px', color: '#495057' }}>📋 cURL要求说明：</div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>✅ 合成成功：</strong>返回二进制语音文件，Content-type: audio/mp3
                        </div>
                        <div>
                          <strong>❌ 合成错误：</strong>返回JSON结果，Content-type: application/json
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button 
                        className="btn btn-primary" 
                        onClick={() => saveTTSConfig()}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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
      <div className="options-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="options-title">
            <img src="../assets/icon-128.png" alt="RaiPodcast Logo" className="options-logo" />
            RaiPodcast 设置
          </h1>
          <p className="options-description">
            配置AI模型和TTS服务，开始您的播客之旅
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-secondary"
            onClick={exportConfig}
            title="导出当前配置到文件"
          >
            📤 导出配置
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => document.getElementById('import-config-input')?.click()}
            title="从文件导入配置"
          >
            📥 导入配置
          </button>
          <input
            id="import-config-input"
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={importConfig}
          />
        </div>
      </div>

      {/* 内容区域 */}
      <div className="options-content">
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
      
      {/* 弹窗组件 */}
      {renderModal()}
    </div>
  );
};

export default Options;