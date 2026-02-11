import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, App, Space, Popconfirm } from 'antd';
import { ReloadOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../utils/api';
import { getApiErrorMessage } from '../utils/api';
import PageState from '../components/PageState';

interface GroupData {
    name: string;
}

const CustomerGroups: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GroupData[]>([]);
  
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [form] = Form.useForm();

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: { groups: string[] } }>('/admin/customer-groups');
      if (res.success && res.data && Array.isArray(res.data.groups)) {
        setData(res.data.groups.map(g => ({ name: g })));
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '获取客户分组失败'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  const handleRename = async () => {
      try {
          const values = await form.validateFields();
          const newName = values.name;
          if (!editingName) return;

          await api.put(`/admin/customer-groups/${editingName}`, { name: newName });
          message.success('重命名成功');
          setIsModalVisible(false);
          form.resetFields();
          setEditingName(null);
          void fetchGroups();
      } catch (err) {
           if (err instanceof Error || (err as any).response) {
            message.error(getApiErrorMessage(err, '重命名失败'));
        }
      }
  }

  const columns: ColumnsType<GroupData> = [
    {
      title: '分组名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => {
                setEditingName(record.name);
                form.setFieldsValue({ name: record.name });
                setIsModalVisible(true);
            }}
          >
              重命名
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>客户分组管理</h2>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchGroups()}>刷新</Button>
        </Space>
      </div>
      
      <div style={{ marginBottom: 16, color: '#666' }}>
          说明：客户分组是基于客户信息中的“分组”字段自动聚合的。重命名分组将批量更新属于该分组的所有客户。
      </div>

      <PageState loading={loading} empty={data.length === 0}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="name"
          pagination={false}
        />
      </PageState>

      <Modal
        title="重命名分组"
        open={isModalVisible}
        onOk={handleRename}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="新分组名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="请输入新名称" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CustomerGroups;
