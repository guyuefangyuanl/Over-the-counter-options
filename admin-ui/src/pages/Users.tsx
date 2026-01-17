import React from 'react';
import { Card, Typography, Empty } from 'antd';

const { Title } = Typography;

const Users: React.FC = () => {
  return (
    <Card>
      <Title level={4}>用户管理</Title>
      <Empty description="Coming Soon" />
    </Card>
  );
};

export default Users;
