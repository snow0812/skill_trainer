# User Twin Studio 页面流转与交互拆分方案

## 背景

当前版本虽然已经从单页重构成 `Overview / Materials / Understanding / Training / Preview / Publish` 六个阶段，但交互上仍然存在一个明显问题：

用户在单个页面内需要同时处理太多任务。

这会带来三个后果：

1. 用户知道“这个阶段很重要”，但不知道“此刻在这个页面里最该做哪一件事”。
2. 页面虽然已经拆开，但大量关键操作仍然堆叠在同一屏里，认知负担依然偏高。
3. 跳转逻辑还偏“功能跳转”，不是“决策驱动跳转”，用户不容易形成稳定心智模型。

这份文档的目标不是再增加更多模块，而是重新定义：

1. 每一页的唯一主任务是什么
2. 用户在什么条件下应该进入下一页
3. 哪些内容应该留在当前页，哪些应该被拆成新的聚焦页面
4. 顶部动作、侧边导航、卡片 CTA 应该如何形成一条清晰的用户路径

## 设计原则

### 1. 一页只回答一个问题

每个页面只能有一个主问题。

示例：

- `Overview` 回答：现在整体进展如何？
- `Materials` 回答：我还需要补什么资料？
- `Understanding` 回答：系统到底理解成什么了？
- `Training` 回答：我要保留、修正、删除哪些判断？
- `Preview` 回答：它做起真实任务来像不像我？
- `Publish` 回答：现在是否值得导出与发布？

如果一个页面同时在回答两个问题，就应该继续拆。

### 2. 阶段页负责导航，聚焦页负责完成任务

建议把未来页面分成两类：

- `阶段首页`
  - 负责解释当前阶段在做什么
  - 负责展示状态摘要
  - 负责引导用户进入下一个具体动作
- `聚焦任务页`
  - 只完成一个动作
  - 完成后明确告诉用户“下一步去哪”

这样可以避免用户进入某个阶段后，看到一整屏信息却不知道先点哪里。

### 3. 跳转必须由“下一步决策”触发，而不是由“功能可用”触发

例如：

- 不应该仅因为可以导出，就一直暴露“发布”
- 不应该仅因为有 `Preview` 能力，就鼓励用户过早试运行
- 不应该仅因为有 claim 列表，就要求用户从第一页开始逐条处理

跳转应该基于当前项目状态来推荐。

### 4. 复杂信息要纵向展开，不要横向堆叠

当前一些页面的问题不是内容太多，而是内容被并排放在同一视野里。

以后应优先采用：

- 上层摘要
- 中层推荐动作
- 底层详情页

而不是：

- 左边一块、右边一块、下面再一大块

## 当前页面拥挤点

### `Overview`

问题：

- 既在做全局总结
- 又在承载“继续训练 / 试运行”
- 还在做 insight 展示与 next actions

结论：

- 保留为阶段首页
- 不应再增加更多操作
- 所有 CTA 都应该跳去更聚焦的任务页

### `Materials`

问题：

- 上传、覆盖度、资料列表都在同一页
- 用户上传完成后，不知道应该继续补资料，还是去蒸馏

结论：

- `Materials` 应该拆成“资料总览”和“资料补强”两个心智层

### `Understanding`

问题：

- 高层理解、结构模式、claim 分组、不确定项都在同一页
- 用户虽然能看见很多内容，但不容易知道“我该先确认哪里”

结论：

- `Understanding` 应该变成“理解首页”
- 重点放在：总结 + 关键偏差 + 去 Training 的入口

### `Training`

问题：

- profile 编辑区和 claim 训练区同时存在
- 用户在“改 profile”与“处理 claim”之间来回切换

结论：

- `Training` 应拆成“训练首页 / Profile 编辑 / Claim 校正队列”三类视图

### `Preview`

问题：

- 输入任务、看输出、看 trace、给反馈、看建议都在同一页
- 容易让用户觉得这是一块“复杂工作台”，而不是一步一步试运行

结论：

- `Preview` 应拆成“试运行页”和“反馈修正页”
- 或至少在路由上形成两层结构

### `Publish`

问题：

- 现在已经比之前清楚很多
- 但仍然同时承担 readiness、平台导出、导出内容预览

结论：

- `Publish` 可以保留为阶段首页
- 但导出结果浏览应独立成详情页或抽屉页

## 新的信息架构建议

建议保留 6 个主阶段，但在每个阶段下增加少量“聚焦任务页”。

### 一级阶段导航

- `Overview`
- `Materials`
- `Understanding`
- `Training`
- `Preview`
- `Publish`

### 二级聚焦路由建议

- `/overview`

- `/materials`
- `/materials/upload`
- `/materials/gaps`
- `/materials/library`

- `/understanding`
- `/understanding/summary`
- `/understanding/patterns`
- `/understanding/uncertainty`

- `/training`
- `/training/profile`
- `/training/claims`
- `/training/claims/:group`

- `/preview`
- `/preview/run`
- `/preview/feedback`

- `/publish`
- `/publish/checklist`
- `/publish/exports`
- `/publish/exports/:file`

这里的重点不是一定马上把所有二级页都实现，而是先按这个思路重新组织交互。

## 每个页面的聚焦任务定义

### 1. `Overview`

主问题：

现在整个分身训练处于什么状态？

应该展示：

- 当前成熟度
- 本轮系统总结
- 当前最值得做的一件事
- 去下一个阶段的单一 CTA

不应该展示：

- 大量 claim 细节
- 大量资料细节
- 复杂训练操作

推荐 CTA 逻辑：

- 资料太少：跳 `Materials`
- 已蒸馏但未确认：跳 `Understanding`
- 已确认部分规则：跳 `Training`
- 已训练可验证：跳 `Preview`
- 已稳定：跳 `Publish`

### 2. `Materials`

主问题：

系统还缺什么资料？

阶段首页 `Materials`：

- 只显示资料覆盖度
- 只显示缺口类型
- 提供两个主要 CTA：
  - `上传新资料`
  - `查看资料库`

`/materials/upload`：

- 只做上传
- 上传成功后提示：
  - 继续补资料
  - 前往蒸馏

`/materials/gaps`：

- 只做缺口解释
- 告诉用户哪些样本不足
- 每种不足对应“建议上传什么”

`/materials/library`：

- 只看资料列表与详情

### 3. `Understanding`

主问题：

系统理解出来的“你”是否靠谱？

阶段首页 `Understanding`：

- 只显示高层理解
- 显示最重要的偏差点
- 给出“优先训练哪一类”的明确建议

`/understanding/summary`：

- 看高层画像

`/understanding/patterns`：

- 看结构化工作方式

`/understanding/uncertainty`：

- 看不确定项和风险项
- CTA：`去 Training 修正`

### 4. `Training`

主问题：

我该改哪部分，才能让它更像我？

阶段首页 `Training`：

- 只显示训练建议队列
- 区分：
  - 应先修 profile
  - 应先修 claims
  - 应先修边界

`/training/profile`：

- 只编辑 profile
- 保存后提示：继续试运行

`/training/claims`：

- 只看 claim 队列

`/training/claims/:group`：

- 一次只处理一个分组，如：
  - 原则
  - 决策
  - 工作流
  - 表达
  - 边界

这样用户会更清楚自己当前在做什么。

### 5. `Preview`

主问题：

它在真实任务里到底像不像我？

阶段首页 `Preview`：

- 解释什么是试运行
- 展示最近一次结果摘要
- CTA：
  - `开始新的试运行`
  - `查看上次反馈`

`/preview/run`：

- 只负责：
  - 选场景
  - 输入任务
  - 查看输出
  - 查看 reason trace

`/preview/feedback`：

- 只负责：
  - 选择反馈标签
  - 查看训练建议
  - 加入训练草稿
  - 跳转回 `Training`

这是最重要的一步，因为它会把“一个复杂工作台”变成“两段式任务流”。

### 6. `Publish`

主问题：

现在是否适合发布？

阶段首页 `Publish`：

- readiness
- 平台选择
- 发布风险

`/publish/checklist`：

- 只做发布前检查

`/publish/exports`：

- 只看导出结果列表

`/publish/exports/:file`：

- 查看单个导出文件内容

## 跳转逻辑建议

### 全局导航分成两层

#### 第一层：阶段导航

左侧保留 6 个主阶段，不增加复杂度。

#### 第二层：页内任务导航

进入阶段页后，在页面顶部出现该阶段的二级任务导航。

示例：

在 `Training` 阶段内显示：

- `训练首页`
- `编辑 Profile`
- `校正 Claims`

在 `Preview` 阶段内显示：

- `试运行首页`
- `开始试运行`
- `反馈修正`

这样既保留了主路径，也给了用户明确的阶段内任务地图。

### CTA 跳转原则

每个页面只保留一个主 CTA 和最多一个次 CTA。

示例：

- `Overview`
  - 主 CTA：进入下一阶段
  - 次 CTA：查看当前摘要详情

- `Materials`
  - 主 CTA：上传资料
  - 次 CTA：查看资料库

- `Understanding`
  - 主 CTA：开始训练
  - 次 CTA：查看依据

- `Training`
  - 主 CTA：保存并去试运行
  - 次 CTA：继续处理 claims

- `Preview`
  - 主 CTA：生成反馈建议
  - 次 CTA：回到训练

- `Publish`
  - 主 CTA：导出当前版本
  - 次 CTA：回看最近导出内容

### 自动推荐跳转

建议未来增加基于项目状态的自动推荐：

- `documents = 0` -> 默认落在 `/materials`
- `documents > 0 and claims = 0` -> 默认落在 `/materials/gaps` 或触发蒸馏提示
- `claims > 0 and accepted_claims 很少` -> 默认推荐 `/understanding` 或 `/training`
- `profile 已形成但未 preview` -> 默认推荐 `/preview`
- `preview 已完成且 export = 0` -> 默认推荐 `/publish`

重点是：系统应该帮助用户决定“下一步去哪”，而不是只给一个静态导航栏。

## 推荐的实现顺序

为了避免一次改太多，建议按下面顺序落地。

### 第一阶段：先做二级路由壳子

先补路由，不急着拆很多新组件：

- `Training`
  - `index`
  - `profile`
  - `claims`

- `Preview`
  - `index`
  - `run`
  - `feedback`

- `Publish`
  - `index`
  - `exports`

这是收益最高的一步。

### 第二阶段：把现有内容重新归位

把当前大页里的内容迁移到合适的二级页里。

优先迁移：

1. `Preview`
2. `Training`
3. `Publish`

因为这三页当前最容易出现“任务挤在一起”的问题。

### 第三阶段：增加状态驱动跳转

补这些能力：

- 下一步推荐
- 任务完成后的跳转提示
- 从 `Preview` 反馈回 `Training` 的显式路径

### 第四阶段：补视觉强化

到这一步再做：

- 阶段进度感
- 当前页聚焦提示
- 完成态 / 待处理态 / 风险态视觉区分

## 最终目标

这个产品不应该让用户感觉自己在一个复杂后台里“管理模块”，而应该让用户感觉自己在经历一条很清楚的训练路径：

1. 我先把资料喂进去
2. 我看系统理解成什么
3. 我修正错误理解
4. 我拿真实任务测试
5. 我根据反馈继续训练
6. 最后我再决定是否发布

如果页面跳转逻辑能持续服务这条路径，用户就会更清楚每个环节该聚焦做什么。

## 对当前版本的直接建议

如果只做一轮小改动，我建议优先做这三件事：

1. 把 `Preview` 拆成 `run` 和 `feedback`
2. 把 `Training` 拆成 `profile` 和 `claims`
3. 把左侧阶段导航保持不变，但在页面顶部加“阶段内任务导航”

这三步就足以明显降低“所有事情挤在一个页面里”的感觉。
