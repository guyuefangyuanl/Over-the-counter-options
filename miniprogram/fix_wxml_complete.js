const fs = require('fs');
const content = fs.readFileSync('pages/inquiry/inquiry.wxml', 'utf8');

// 重新创建完整的WXML文件，确保所有标签正确匹配
const correctedContent = `<!--pages/inquiry/inquiry.wxml-->
<wxs src="./inquiry.wxs" module="utils" />

<view class="container">
  <!-- 顶部固定内容 -->
  <view class="top-fixed-section">
    <!-- 1. 市场指数 -->
    <scroll-view class="market-indexes" scroll-x show-scrollbar="{{false}}">
      <view class="market-index-item" wx:for="{{marketIndexes}}" wx:key="name">
        <view class="market-index-name">{{item.name}}</view>
        <view class="market-index-value {{item.changePercent > 0 ? 'is-rise' : (item.changePercent < 0 ? 'is-fall' : '')}}">{{item.value}}</view>
        <view class="market-index-change {{item.changePercent > 0 ? 'is-rise' : (item.changePercent < 0 ? 'is-fall' : '')}}">
          {{utils.formatChange(item.changePercent)}}
        </view>
      </view>
      <view class="current-time">{{currentTime}}</view>
    </scroll-view>

    <!-- 2. Tab导航容器 -->
    <view class="tabs-container">
      <!-- 主Tab -->
      <view class="primary-tabs">
        <view class="primary-tab-item {{activePrimaryTab === 'self' ? 'is-active' : ''}}" hover-class="press" bindtap="switchPrimaryTab" data-tab="self">自选</view>
        <view class="primary-tab-item {{activePrimaryTab === 'stock' ? 'is-active' : ''}}" hover-class="press" bindtap="switchPrimaryTab" data-tab="stock">个股</view>
        <view class="primary-tab-item {{activePrimaryTab === 'index' ? 'is-active' : ''}}" hover-class="press" bindtap="switchPrimaryTab" data-tab="index">指数</view>
        <view class="primary-tab-item {{activePrimaryTab === 'etf' ? 'is-active' : ''}}" hover-class="press" bindtap="switchPrimaryTab" data-tab="etf">ETF</view>
      </view>
      <!-- 子Tab (自选时显示) -->
      <view class="sub-tabs" wx:if="{{activePrimaryTab === 'self'}}">
        <scroll-view class="sub-tabs-scroll" scroll-x show-scrollbar="{{false}}">
          <view class="sub-tab-item {{activeSubTab === item.id ? 'is-active' : ''}}" hover-class="press" wx:for="{{systemGroups}}" wx:key="id" bindtap="switchSubTab" data-tab="{{item.id}}">{{item.name}}</view>
          <view class="sub-tab-item {{activeSubTab === item.id ? 'is-active' : ''}}" hover-class="press" wx:for="{{customGroups}}" wx:key="id" bindtap="switchSubTab" data-tab="{{item.id}}">{{item.name}}</view>
        </scroll-view>
        <view class="edit-group-btn" bindtap="showGroupManage">
          <image src="../../images/edit.svg" class="edit-icon" mode="aspectFit" lazy-load="true" />
        </view>
      </view>
    </view>

    <!-- 3. 搜索与筛选 -->
    <view class="filters-section">
      <view class="search-bar">
        <image src="../../images/icons/search.png" class="search-icon" mode="aspectFit" lazy-load="true" />
        <input class="search-input" placeholder="搜索股票名称/代码" value="{{searchKeyword}}" bindinput="onSearchInput" />
        <image wx:if="{{searchKeyword}}" src="../../images/close.svg" class="clear-icon" bindtap="onSearchClear" mode="aspectFit" lazy-load="true" />
      </view>
      <view class="filter-tabs-group">
        <text class="filter-label">期限</text>
        <view class="term-tabs">
          <view class="term-tab {{activeTerm === '1M' ? 'is-active' : ''}}" hover-class="press" bindtap="switchTerm" data-term="1M">1M</view>
          <view class="term-tab {{activeTerm === '2M' ? 'is-active' : ''}}" hover-class="press" bindtap="switchTerm" data-term="2M">2M</view>
          <view class="term-tab {{activeTerm === '3M' ? 'is-active' : ''}}" hover-class="press" bindtap="switchTerm" data-term="3M">3M</view>
          <view class="term-tab {{activeTerm === '6M' ? 'is-active' : ''}}" hover-class="press" bindtap="switchTerm" data-term="6M">6M</view>
        </view>
      </view>
      <view class="filter-tabs-group">
        <text class="filter-label">结构</text>
        <view class="structure-tabs">
          <view class="structure-tab {{activeStructure === 'vanilla' ? 'is-active' : ''}}" hover-class="press" bindtap="switchStructure" data-structure="vanilla">香草</view>
          <view class="structure-tab {{activeStructure === 'snowball' ? 'is-active' : ''}}" hover-class="press" bindtap="switchStructure" data-structure="snowball">雪球</view>
        </view>
      </view>

      <!-- 数据说明入口（与设计稿位置一致靠右显示） -->
      <view class="data-explain-trigger" hover-class="press" bindtap="showDataExplanation">
        <text>数据说明</text>
        <image src="../../images/info.png" class="icon-small" mode="aspectFit" lazy-load="true" />
      </view>
    </view>
  </view>

  <!-- 分组管理底部弹层 -->
  <van-popup show="{{showGroupManagePopup}}" round position="bottom" custom-style="height: 60%;" bind:close="onGroupManageClose">
    <view class="group-manage-sheet">
      <view class="sheet-title">全部分组设置</view>
      <view class="sheet-subtitle">显示分组</view>
      <view class="group-list">
        <view class="group-item {{pendingDisplayGroupId === 'all' ? 'active' : ''}} {{isEditMode ? 'edit-mode-disabled' : ''}}" bindtap="{{!isEditMode ? 'selectPendingGroup' : ''}}" data-id="all">
          <text>全部 ({{groupCountsById.all || 0}})</text>
          <van-icon name="success" size="20px" wx:if="{{!isEditMode && pendingDisplayGroupId === 'all'}}" />
        </view>
        <view class="group-item {{pendingDisplayGroupId === 'holding' ? 'active' : ''}} {{isEditMode ? 'edit-mode-disabled' : ''}}" bindtap="{{!isEditMode ? 'selectPendingGroup' : ''}}" data-id="holding">
          <text>持仓 ({{groupCountsById.holding || 0}})</text>
          <van-icon name="success" size="20px" wx:if="{{!isEditMode && pendingDisplayGroupId === 'holding'}}" />
        </view>
        <block wx:for="{{customGroups}}" wx:key="id">
          <view class="group-item {{pendingDisplayGroupId === item.id ? 'active' : ''}} {{isEditMode ? 'edit-mode' : ''}}" 
                bindtap="{{!isEditMode ? 'selectPendingGroup' : ''}}" 
                data-id="{{item.id}}">
            <text>{{item.name}} ({{groupCountsById[item.id] || 0}})</text>
            <van-icon name="success" size="20px" wx:if="{{!isEditMode && pendingDisplayGroupId === item.id}}" />
            <view class="edit-actions" wx:if="{{isEditMode}}">
              <van-icon name="edit" size="18px" bindtap="openRenameGroupDialog" data-id="{{item.id}}" />
              <van-icon name="delete" size="18px" bindtap="openDeleteGroupDialog" data-id="{{item.id}}" />
            </view>
          </view>
        </block>
      </view>
      <view class="sheet-actions">
        <van-button size="small" type="default" bind:click="openNewGroupDialog">新建分组</van-button>
        <van-button size="small" type="default" bind:click="toggleEditMode">{{isEditMode ? '完成' : '编辑分组'}}</van-button>
        <view class="spacer"></view>
        <van-button size="small" type="default" bind:click="onGroupManageCancel">取消</van-button>
        <van-button size="small" type="primary" bind:click="onGroupManageConfirm">确定</van-button>
      </view>
    </view>
  </van-popup>
  
  <!-- 重命名分组弹窗 -->
  <van-popup show="{{showRenameGroupDialog}}" round position="center" bind:close="closeRenameGroupDialog">
    <view class="new-group-dialog">
      <view class="dialog-title">重命名分组</view>
      <van-field value="{{editingGroupName}}" placeholder="最多20个字" maxlength="20" bind:change="onRenameGroupInput" />
      <view class="input-error" wx:if="{{renameGroupError}}">{{renameGroupError}}</view>
      <view class="dialog-actions">
        <van-button size="small" type="default" bind:click="closeRenameGroupDialog">取消</van-button>
        <van-button size="small" type="primary" disabled="{{!canConfirmRename}}" bind:click="confirmRenameGroup">确定</van-button>
      </view>
    </view>
  </van-popup>
  
  <!-- 删除分组确认弹窗 -->
  <van-popup show="{{showDeleteGroupDialog}}" round position="center" bind:close="closeDeleteGroupDialog">
    <view class="new-group-dialog delete-dialog">
      <view class="dialog-title">删除分组</view>
      <view class="delete-content">
        <text wx:if="{{deleteMigrationCount > 0}}">该分组下有{{deleteMigrationCount}}个自选，请选择迁移目标：</text>
        <text wx:else>确认删除该分组？</text>
      </view>
      <picker wx:if="{{deleteMigrationCount > 0 && availableTargetGroups.length > 0}}" 
              value="{{selectedTargetGroupIndex}}" 
              range="{{availableTargetGroups}}" 
              range-key="name"
              bindchange="onTargetGroupChange">
        <view class="picker-view">
          <text>{{targetGroupDisplayText}}</text>
          <van-icon name="arrow-down" size="14px" />
        </view>
      </picker>
      <view class="dialog-actions">
        <van-button size="small" type="default" bind:click="closeDeleteGroupDialog">取消</van-button>
        <van-button size="small" type="danger" bind:click="confirmDeleteGroup">删除</van-button>
      </view>
    </view>
  </van-popup>

  <!-- 4. 报价表格 (横向/纵向滚动) -->
  <scroll-view class="quotes-table-wrapper" scroll-y scroll-x enhanced show-scrollbar="{{false}}">
    <view class="quotes-table">
      <!-- 表头 -->
      <view class="table-header">
        <view class="th th-name">标的|代码</view>
        <view class="th th-change">涨跌幅</view>
        <view class="th th-rate">平值</view>
        <view class="th th-rate">虚值105</view>
        <view class="th th-rate">虚值110</view>
      </view>

      <!-- 表格行 -->
      <block wx:for="{{quoteList}}" wx:key="id">
        <view class="table-row {{selectedForEdit.indexOf(item.id) > -1 ? 'is-selected' : ''}}" 
              hover-class="row-hover" 
              bindtap="{{isEditing ? 'toggleEditSelection' : 'goToDetail'}}" 
              data-id="{{item.id}}">
          <view class="td td-name">
            <text class="stock-name">{{item.name}}</text>
            <text class="stock-code">{{item.code}}</text>
          </view>
          <view class="td td-change {{item.changePercent > 0 ? 'is-rise' : (item.changePercent < 0 ? 'is-fall' : '')}}">
            {{utils.formatChange(item.changePercent)}}
          </view>
          <view class="td td-rate">{{item.rates['100']}}%</view>
          <view class="td td-rate">{{item.rates['105']}}%</view>
          <view class="td td-rate">{{item.rates['110']}}%</view>
        </view>
      </block>

      <!-- 空状态 -->
      <view class="empty-state" wx:if="{{!quoteList.length}}">
          <image src="../../images/empty.svg" class="empty-icon" mode="aspectFit" lazy-load="true" />
        <text class="empty-text">暂无数据</text>
      </view>
    </view>
  </scroll-view>

  <!-- 底部固定操作栏 (自选编辑模式) -->
  <view class="bottom-actions" wx:if="{{isEditing}}">
    <van-button round type="default" bind:click="cancelEditing">取消</van-button>
    <van-button round type="primary" bind:click="{{isAddingMode ? 'confirmAddToSelection' : 'confirmRemoveFromSelection'}}">
      {{isAddingMode ? '添加选中' : '删除选中'}}
    </van-button>
  </view>

  <!-- 数据说明弹窗 -->
  <van-popup show="{{showDataInfo}}" round position="center" custom-style="width: 80%; max-height: 60%;" bind:close="onDataInfoClose">
    <view class="data-info-popup">
      <view class="data-info-header">
        <text class="data-info-title">数据说明</text>
        <van-icon name="cross" bind:click="onDataInfoClose" />
      </view>
      <scroll-view scroll-y class="data-info-content">
        <text class="data-info-text">
          1. 香草看涨期权费率百分比费率，即期权费除以名义本金的比值。例如：期权费率为5%，则买入香草看涨期权100万的名义本金，付出期权费为5万元。
          
          2. 期权费率为参考费率，与交易台报价或成交价可能有区别。
        </text>
      </scroll-view>
      <view class="data-info-footer">
        <van-button type="primary" round block bind:click="onDataInfoClose">我知道了</van-button>
      </view>
    </view>
  </van-popup>

  <!-- 快捷入口 -->
    <view class="quick-actions">
      <view class="quick-action-item" bindtap="goToCalculator" hover-class="press">
        <image src="../../images/calculator.png" class="quick-action-icon" mode="aspectFit" lazy-load="true" />
        <text class="quick-action-text">计算器</text>
      </view>
      <view class="quick-action-item" bindtap="goToWorkspace" hover-class="press">
        <image src="../../images/workbench.png" class="quick-action-icon" mode="aspectFit" lazy-load="true" />
        <text class="quick-action-text">工作台</text>
      </view>
    </view>
</view>`;

// 写入修复后的文件
fs.writeFileSync('pages/inquiry/inquiry.wxml', correctedContent);

console.log('WXML文件已完全修复');
