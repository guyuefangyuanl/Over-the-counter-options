import React from 'react';
import { Card, Empty } from 'antd';

const MessageList: React.FC = () => {
  return (
    <Card>
      <h2>消息列表</h2>
      <Empty description="功能开发中" />
    </Card>
  );
};

export default MessageList;
