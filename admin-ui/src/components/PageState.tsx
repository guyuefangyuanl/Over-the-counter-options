import React from 'react';
import { Button, Empty, Result, Spin } from 'antd';

type PageStateProps = {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  onRetry?: () => void;
  children: React.ReactNode;
};

const PageState: React.FC<PageStateProps> = ({ loading, error, empty, onRetry, children }) => {
  if (loading) {
    return (
      <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle={error}
        extra={onRetry ? <Button onClick={onRetry}>重试</Button> : undefined}
      />
    );
  }

  if (empty) {
    return (
      <div style={{ padding: '48px 0' }}>
        <Empty description="暂无数据" />
      </div>
    );
  }

  return <>{children}</>;
};

export default PageState;
