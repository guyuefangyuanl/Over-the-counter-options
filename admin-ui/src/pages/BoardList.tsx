import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Button, Modal, Form, Input, App, Space, Tag, Drawer, List, Tooltip, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import api from '../utils/api';
import { getApiErrorMessage } from '../utils/api';
import PageState from '../components/PageState';

interface GroupMember {
  stock_code: string;
  market?: string;
  name?: string;
  added_at?: string;
}

interface Group {
  id: string;
  name: string;
  creator_id: string;
  members: GroupMember[];
  created_at: string;
  updated_at: string;
}

const BoardList: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Group[]>([]);
  
  // Modal states
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [form] = Form.useForm();
  
  // Drawer states (Members)
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [currentGroup, setCurrentGroup] = useState<Group | null>(null);
  const [memberForm] = Form.useForm();

  const isFormValidationError = (error: unknown) => {
    if (!error || typeof error !== 'object') return false;
    const fields = (error as { errorFields?: unknown }).errorFields;
    return Array.isArray(fields);
  };

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ success: boolean; data: Group[] }>('/groups');
      if (res.success && Array.isArray(res.data)) {
        setData(res.data);
      }
    } catch (err) {
      message.error(getApiErrorMessage(err, '获取板块列表失败'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  const handleCreateOrUpdate = async () => {
    try {
      const values = await form.validateFields();
      if (editingGroup) {
        await api.put(`/groups/${editingGroup.id}`, { name: values.name });
        message.success('更新成功');
      } else {
        await api.post('/groups', { name: values.name });
        message.success('创建成功');
      }
      setIsModalVisible(false);
      form.resetFields();
      setEditingGroup(null);
      void fetchGroups();
    } catch (err) {
      if (isFormValidationError(err)) return;
      message.error(getApiErrorMessage(err, '操作失败'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/groups/${id}`);
      message.success('删除成功');
      void fetchGroups();
    } catch (err) {
      message.error(getApiErrorMessage(err, '删除失败'));
    }
  };

  const handleAddMember = async () => {
      if (!currentGroup) return;
      try {
          const values = await memberForm.validateFields();
          await api.post(`/groups/${currentGroup.id}/members`, values);
          message.success('添加成员成功');
          memberForm.resetFields();
          // Refresh current group data
          const res = await api.get<{ success: boolean; data: Group[] }>('/groups');
          if (res.success) {
              const updatedGroup = res.data.find(g => g.id === currentGroup.id);
              if (updatedGroup) {
                  setCurrentGroup(updatedGroup);
                  // Also update list
                  setData(res.data);
              }
          }
      } catch (err) {
        if (isFormValidationError(err)) return;
        message.error(getApiErrorMessage(err, '添加成员失败'));
      }
  }

  const handleRemoveMember = async (stock_code: string) => {
      if (!currentGroup) return;
      try {
          await api.delete(`/groups/${currentGroup.id}/members/${stock_code}`);
          message.success('移除成员成功');
           // Refresh current group data
           const res = await api.get<{ success: boolean; data: Group[] }>('/groups');
           if (res.success) {
               const updatedGroup = res.data.find(g => g.id === currentGroup.id);
               if (updatedGroup) {
                   setCurrentGroup(updatedGroup);
                   setData(res.data);
               }
           }
      } catch (err) {
          message.error(getApiErrorMessage(err, '移除成员失败'));
      }
  }

  const columns: ColumnsType<Group> = [
    {
      title: '板块名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '成员数量',
      key: 'members',
      render: (_, record) => record.members?.length || 0,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => val ? new Date(val).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Tooltip title="管理成员">
            <Button 
                icon={<UnorderedListOutlined />} 
                size="small" 
                onClick={() => {
                    setCurrentGroup(record);
                    setDrawerVisible(true);
                }}
            />
          </Tooltip>
          <Tooltip title="重命名">
            <Button 
                icon={<EditOutlined />} 
                size="small" 
                onClick={() => {
                    setEditingGroup(record);
                    form.setFieldsValue({ name: record.name });
                    setIsModalVisible(true);
                }}
            />
          </Tooltip>
          <Popconfirm title="确定删除吗？" onConfirm={() => handleDelete(record.id)}>
             <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2>板块管理</h2>
        <Space>
          <Button icon={<PlusOutlined />} type="primary" onClick={() => {
              setEditingGroup(null);
              form.resetFields();
              setIsModalVisible(true);
          }}>新建板块</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchGroups()}>刷新</Button>
        </Space>
      </div>

      <PageState loading={loading} empty={data.length === 0}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
        />
      </PageState>

      <Modal
        title={editingGroup ? '重命名板块' : '新建板块'}
        open={isModalVisible}
        onOk={handleCreateOrUpdate}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="板块名称" rules={[{ required: true, message: '请输入板块名称' }]}>
            <Input placeholder="请输入板块名称" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`管理成员 - ${currentGroup?.name}`}
        width={500}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
      >
        <div style={{ marginBottom: 16 }}>
             <Form form={memberForm} layout="inline" onFinish={handleAddMember}>
                <Form.Item name="stock_code" rules={[{ required: true, message: '请输入代码' }]}>
                    <Input placeholder="股票代码 (如 000001)" />
                </Form.Item>
                 <Form.Item name="name">
                    <Input placeholder="名称 (可选)" />
                </Form.Item>
                 <Form.Item name="market">
                    <Input placeholder="市场 (可选, 如 sh/sz)" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item>
                    <Button type="primary" htmlType="submit">添加</Button>
                </Form.Item>
             </Form>
        </div>
        <List
            itemLayout="horizontal"
            dataSource={currentGroup?.members || []}
            renderItem={(item) => (
            <List.Item
                actions={[<Button type="link" danger onClick={() => handleRemoveMember(item.stock_code)}>移除</Button>]}
            >
                <List.Item.Meta
                title={<>{item.stock_code} <Tag>{item.market}</Tag></>}
                description={item.name || '无名称'}
                />
            </List.Item>
            )}
        />
      </Drawer>
    </Card>
  );
};

export default BoardList;
