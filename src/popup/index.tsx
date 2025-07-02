import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './Popup';

// 创建React应用根节点
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
} else {
  console.error('找不到根容器元素');
}