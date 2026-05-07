# Atomic Ideation — Design v1
## LLM 辅助多人异步研究 ideation 系统的完整设计文档

**版本**: v1（基于 Literature Review v1 + 两轮 design Q&A 的对齐结果）
**日期**: 2026-05-06
**作者**: Zack 提供决策，Claude 整理与起草
**前置文件**: `Literature_Review_v1.md`（gap 分析与文献基础）、`Scaffold Demo/HANDOFF.md`（技术现状）

> **重要**：此文档严格基于你已经明确表态的决策。任何"由 Claude 推断"的条目都用 🧠 标记，方便你之后撤销。

---

## Part 0 · TL;DR

我们设计的系统叫 **Atomic Ideation**——一个面向研究社区的、异步的、跨学科的 LLM 辅助 ideation 平台。它通过三个**界面层面**的机制创新解决三个文献已实证的失败模式：

| 失败模式 | 我们的机制对策 | 对应 paper claim |
|---------|--------------|----------------|
| 长讨论新加入者 onboarding 成本爆炸 [Wikum, A Review of LLM-Assisted Ideation] | **Profile-driven canvas tour**：AI 导游式带路而非纯文本墙 | C1 (体验+机制) |
| LLM 群体级同质化 [Anderson et al. C&C 2024, Doshi & Hauser 2024] | **AI-as-connector**：LLM 仅建议**已有原子之间的关系**，不允许生成新原子 | C2 (机制，paper 核心论点) |
| 跨学科视角在 LLM 整合中被洗成"平均声音" [Olson&Olson, He et al. CHI 2025] | **Streaming voice-to-atom + provenance**：原子带颜色与来源，AI 不能改写或合并跨人原子 | C3 (体验+机制) |

**唯一一句话定位**：第一个把 LLM 限制为"连接器"而非"作者"、用 streaming 实时原子化承载思绪流、用导游式 onboarding 替代文本墙的多人异步研究 ideation 平台。

---

## Part A · Key Paper Framing

### A.1 Abstract draft（用于 SIG / introduction 起草）

> Research ideation increasingly takes place in distributed, asynchronous, cross-disciplinary settings — extended workshop discussions, cross-lab proposal building, and online research communities. Yet existing LLM-augmented ideation tools either serve a single user (Sensecape, Selenite, Memolet, Cocoa) or a synchronous small team (AI-Augmented Brainwriting, Collaborative Canvas, CoQuest), and they let the LLM freely produce ideas. Recent empirical work has shown this design choice systematically homogenizes group-level idea diversity (Anderson et al. C&C 2024; Doshi & Hauser 2024; Padmakumar & He). At the same time, asynchronous "relay" scenarios suffer from steep newcomer onboarding cost and from a loss of provenance when LLMs summarize across voices. We present **Atomic Ideation**, an LLM-augmented multi-user platform for research community ideation, organized around three interaction-level mechanisms: (i) **streaming voice-to-atom** input that lets contributors see their stream of thought decomposed into minimal, attributable units in real time; (ii) **AI-as-connector** — the LLM is structurally constrained to suggest relations (support, challenge, build-on, question, cite) between existing human or literature atoms, and is forbidden from authoring new atoms; (iii) a **profile-driven canvas tour** that onboards new contributors via personalized AI guidance and zoom navigation, replacing text-summary walls. We argue these mechanisms together reduce onboarding cost while structurally resisting LLM homogenization, and we lay out the system design and a planned user study to evaluate these claims.

### A.2 Three Research Questions

继承自 Literature Review §5.2，再次明确：

- **RQ1**（Onboarding cost）：与 Wikum-style summary、AI-Augmented Brainwriting baseline、纯线性帖相比，**streaming 原子化 + profile-driven canvas tour** 是否能显著降低新加入者的 sensemaking 成本（time-to-first-contribution、accurate recall of existing positions）？
- **RQ2**（Homogenization）：当 LLM 被结构性约束为"仅连接现有原子，不能产生新原子"时，与让 LLM 自由生成 idea 的 baseline 相比，群体最终输出的 idea 多样性指标（embedding pairwise distance、topic LDA distance）会如何变化？
- **RQ3**（Cross-disciplinary engagement）：把 contributor background 作为视觉一阶变量（颜色 + Stretch You 推荐）是否促进跨学科的 build-on 关系涌现？还是反而触发 identity anchoring（同质聚集）？

### A.3 Three Innovations vs Implementation Details

> **核心提醒**（来自你的明确指示）："具体非常细的细节设计未必能撑起一个创新点，只是创新设计的某一种实现。"

| | 是创新点（机制级别，paper-claimable） | 是实现细节（设计级别，demo-visible） |
|---|----------------------------------|-------------------------------|
| 1 | **Streaming voice-to-atom** 思绪流即时原子化 | dock 形态、波形动画、原子飞行 |
| 2 | **AI-as-connector** AI 受约束角色 | 幽灵键的具体颜色、接受/拒绝按钮位置 |
| 3 | **Profile-driven canvas tour** 个性化导游 onboarding | 镜头运动曲线、AI 旁白卡片样式 |
| | （次要 / 已在文献存在） | |
| - | 三类原子视觉差异化（G1，多人系统里第一个） | 字体与边框选择 |
| - | 涌现式聚类 + crystallize（G5，IdeaHound 已有） | dashed halo 与按钮位置 |
| - | Background coloring + With/Stretch You 双轨（G3） | 颜色 token 与 chip 样式 |
| - | 戳破式 bubble 展开（认知负荷设计） | hover delay 时长、展开动效 |

**Paper 主推 C1+C2+C3**；其余在 system 描述里出现，但不作为独立 contribution claim。

---

## Part B · User Journey

按三条用户线展开：B1 全新用户首登 / B2 老用户回访接力 / B3 Subtopic 成熟到 Proposal。

每条 journey 用 step-by-step 描述，每步标注 **目标 / 触发的核心机制 / 预期情绪**。

### B1 · 全新用户首登（"Sarah，AI for Education 新研究者"）

**用户画像**：Sarah 是教育心理学博士生，第一次听同事提起这个平台。她研究"元认知支持"，不熟悉 CS 圈对 AI 辅导的最新实证。

| 步骤 | 用户动作 | 系统响应 | 触发机制 | 情绪目标 |
|----|--------|--------|--------|--------|
| 1 | 用 Google Scholar 登录 / 邮箱注册 | 系统拉取 Scholar profile（最近 5 年论文标题、摘要、关键词、合作者）| Profile boot-strap | "我不用从零填表" |
| 2 | 看到一个极简 Profile 卡：研究方向、关键词、机构、affiliation。可一键编辑 | 提示："这些信息将随你使用而自动 enrich" | Profile growth（隐性） | "我有控制权但不被烦" |
| 3 | 进入 Lobby（参 §C.1）。看到双轨：左 Yours（暂为空，提示"还没有 workshop"）、右 Explore | 右侧出现 3-5 个 workshop 卡，按 profile 相关度排序，标注 "based on your work on metacognition support" | Profile-driven recommend | "系统真的看了我的 profile" |
| 4 | 点 "AI for Education" workshop | **页面切换**到 Workshop Canvas（参 §C.2）。第一眼看到的是：暖色 paper 画布上散落几个 Topic 区域；右下角出现一个微小的 AI tour 卡片（不弹窗）："想让我带你走一圈吗？" | Tour entry | "不强制但很欢迎" |
| 5 | 点"带我走一圈" | **进入导游模式**：镜头平滑 zoom 到第一个推荐 Topic（"Metacognition Support"），AI 卡片出现："这个 topic 有 3 个 subtopic 在活跃，最热的是 Adaptive Scaffolding——你的论文里也提过这个概念。要去看看吗？" | **Profile-driven canvas tour**（核心创新 C3） | "像被一个友善的同事带" |
| 6 | 点"是" | 镜头继续 zoom 到 Adaptive Scaffolding bubble，bubble **戳破展开**（参 §D.2）。Sarah 看到内部 8 个原子（4 个人类、2 文献、2 AI 连接），按颜色区分贡献者背景 | Bubble pop + 三类原子展示 | "信息密度可控，不爆炸" |
| 7 | 阅读 5-10 秒后，AI 卡片更新："这里目前的 tension 是教师 vs 学生主导。你研究过什么相关角度？想说点什么吗？" | 微妙提示底部 mic 按钮 | Dynamic prompt | "我被邀请了，不是被审视" |
| 8 | Sarah 按住 mic 开始讲："我觉得 metacognitive prompts 在低自我效能学生中可能反而……" | **Streaming dock 启动**：底部出现波形 + 实时转写文本；与此同时，画布上方一个细窄的"思绪流"区域开始显示 AI 实时识别出的候选原子，每个原子从思绪流"飞向"它最相关的位置（Adaptive Scaffolding 内部 / floater 区域 / 跨 topic） | **Streaming voice-to-atom**（核心创新 C1） | "我说话的时候就能看到我的想法在塑形" |
| 9 | 讲完后松开 mic | 思绪流消失，原子已落位。Sarah 的颜色（淡紫，profile 自动分配）显示在新原子上 | Provenance 一阶可见（G3） | "我的视角被立刻看见" |
| 10 | Sarah 双击其中一个原子查看 | 抽屉打开显示：原始语音段落（双向回链）、AI 提取理由、相邻原子建议 | Atom ↔ source bi-directional link | "我没失去原始上下文" |
| 11 | 几秒后，AI 在 Sarah 的新原子和某个 existing 原子之间画出一条**幽灵蓝色虚线**："这两个原子可能构成 build-on 关系？接受 / 拒绝" | **AI-as-connector**（核心创新 C2，幽灵键） | "AI 帮我连而不抢功" |
| 12 | Sarah 接受 | 幽灵键变成实键（蓝色实线带箭头）。其他贡献者会看到 Sarah 的新贡献和这条新连接 | 关系成为知识图谱 | 完成首次贡献 |

**B1 完成判定**：Sarah 在 < 3 分钟内完成了第一个 atom 贡献 + 1 个 reaction。她未曾阅读任何超过 80 字的 AI summary 文本块。

### B2 · 老用户回访接力（"David，3 周后回到 workshop"）

**用户画像**：David 在 3 周前已经贡献过 12 个原子，同步研究忙没回来。今晚收到邮件通知："你订阅的 Adaptive Scaffolding 自上次以来有 9 个新原子和 2 个新连接"。

| 步骤 | 用户动作 | 系统响应 | 触发机制 | 情绪目标 |
|----|--------|--------|--------|--------|
| 1 | 点邮件链接 | 直接打开 Workshop Canvas，**镜头预先定位**在 Adaptive Scaffolding subtopic（已 expanded） | Deep link + camera memory | "不用从首页找回去" |
| 2 | 看到一条**时间线 ribbon** 横在画布顶部："Since your last visit (3 weeks ago) →"，下方按时间排列 9 个新原子的缩略 | "Since last visit" 高亮 | Newcomer onboarding cost ↓（G4） | "我立刻知道动态" |
| 3 | David 点"按 AI 总结"（可选） | AI 在 ribbon 下方画出一个**轻量动画时间线**（不是文字总结）：从 3 周前的状态镜头平移到现在的状态，关键变化（新 cluster 形成 / 新 reaction 出现）依次高亮 | Visual diff 替代 text summary（呼应 D4 你的明确要求） | "我看到了变化，不是读了变化" |
| 4 | David 选中其中一个新原子，点"对其反应" | 浮出 reaction 菜单（5 类）。David 选 Build-on，开始口述他的延伸 | Streaming + reaction 同步 | "我可以延续别人的思路" |
| 5 | 几句话后，AI 检测到 David 的延伸与另一个 floater 高度相似，幽灵键"出现"提示 | AI 主动连接（C2） | "AI 把碎片串起来了" |
| 6 | 一周后 David 再回来 | Personal Dashboard（top nav 入口）显示："你的原子被引用 5 次 / 你的连接被 +1 累计 8 次 / 你与 Maya 在同一 subtopic 反复互动，可能是合作候选人" | 个人贡献 + 合作发现 | "我的贡献被看见、被回路" |

**B2 完成判定**：David 在 < 1 分钟内 reorient 到上次离开的位置，且能立即开始贡献而不需要阅读完整讨论史。

### B3 · Subtopic 成熟到 Proposal

**用户画像**：Adaptive Scaffolding subtopic 经过 8 周积累，原子数 47、贡献者 9、文献 12、关键 reaction 35 条。系统检测到成熟度指标达标。

| 步骤 | 用户动作 | 系统响应 | 触发机制 | 情绪目标 |
|----|--------|--------|--------|--------|
| 1 | 该 subtopic 内任一贡献者下次进入时 | bubble 顶部出现一个静态 chip："Maturity reached. Compose proposal?" | 成熟度信号（G5） | 不催促，但显眼 |
| 2 | 任一贡献者点 "Compose proposal" | **不立刻生成**。先弹出一个轻量 dialog："Pick 1-3 anchor atoms — these will steer the proposal's framing." 用户从 subtopic 内选择 anchor | Human-led, AI-assisted | "我在驾驶，不是被驾驶" |
| 3 | 用户选完 anchor，点 "Draft" | AI 生成 proposal 草稿（multi-section: motivation / RQ / approach / expected outcome）。每段下方标注**来源构成 chips**：人类 65%（7 atoms） / 文献 20%（2 atoms） / AI 15%（连接整合）| Provenance 一阶可见（G3） | "我能审计每一段的来源" |
| 4 | 用户编辑 / 删段 / 重新生成某段 | 编辑保留 provenance 标注；删段时该段引用的 atoms 在 subtopic 里 dim 一层（"已被本 proposal 排除"） | Editable provenance | "编辑不破坏可追溯" |
| 5 | 用户点 "Notify all contributors" | 该 subtopic 的所有贡献者收到通知："Adaptive Scaffolding has a draft proposal. Review and co-author?" | 自然形成研究小组 | 协作通向 publication |
| 6 | 三名贡献者接受 co-author 邀请 | proposal 进入 multi-author 编辑模式（类似 Google Docs 的协同编辑，但每个段落有 lineage） | Group formation | 研究合作落地 |

**B3 完成判定**：该 subtopic 的成熟阶段，至少 3 名贡献者形成实质合作意愿。

---

## Part C · 界面设计（核心 surface）

我会用 wireframe-level 的 ASCII 描述 + 关键尺寸/交互细节描述。每个 surface 都标注与现有 demo 的 delta。

### C.0 · Profile Boot 屏（first-time login）

```
┌─────────────────────────────────────────────────────────────┐
│  Atomic Ideation                                            │
│                                                             │
│  Welcome.                                                   │
│                                                             │
│  Let us know who you are — we'll do less typing.            │
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │  Continue with Google Scholar        │  ← primary        │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  ┌──────────────────────────────────────┐                   │
│  │  Continue with email                 │  ← fallback       │
│  └──────────────────────────────────────┘                   │
│                                                             │
│  ─────────── after Google Scholar OAuth ───────────         │
│                                                             │
│  We pulled this from your profile. Edit if needed.          │
│                                                             │
│   Name           Sarah Chen                          [edit] │
│   Affiliation    EdTech Lab, UIUC                    [edit] │
│   Background     ●● Education  ● Cognitive Science   [+ tag]│
│   Recent topics  metacognition · self-regulation           │
│                  · scaffolding · self-efficacy        [+]   │
│                                                             │
│   ┌─────────────────────────────────────┐                   │
│   │   Take me to the lobby →            │                   │
│   └─────────────────────────────────────┘                   │
│                                                             │
│   These details will refine themselves as you contribute.   │
└─────────────────────────────────────────────────────────────┘
```

**关键细节**：
- Profile 5 个字段都是可编辑的，不强制完整。
- "Background" 是多 tag，不是单选；用 dot 数量隐喻强度（用户后续可调）。
- "Recent topics" 是从 Scholar 抓的关键词，用户可增删。
- 整屏没有 password / phone 等强制字段——降低首次门槛。

🧠 **Claude 推断**：如果用户未通过 Scholar 登录，第一屏也提供"手动填一个 1-min profile"备选——5 个字段同上。

### C.1 · Lobby（双轨布局，登录后默认入口）

```
┌─────────────────────────────────────────────────────────────────────┐
│ 〇 Atomic ideation                            🔍 search   🔔  S    │
├─────────────────────────────────────────────────────────────────────┤
│  LOBBY                                                              │
│                                                                     │
│  Where would you                                                    │
│  like to think today?                                               │
│                                                                     │
│  Pick a workshop. Your atoms join a conversation already in motion. │
│                                                                     │
│  ┌──────────────────────────────────┬──────────────────────────────┐│
│  │ YOURS                            │ EXPLORE                      ││
│  │ ─────                            │ ─────                        ││
│  │                                  │                              ││
│  │ 🟢 AI for Education              │ AI for Health                ││
│  │  Contributor · 12 atoms          │  Recommended · why?          ││
│  │  Last update 3w ago              │  Active now · 4 contributors ││
│  │  ●●●●● ● ●                       │  ●●● ●                       ││
│  │                                  │                              ││
│  │ 🟡 Climate Adaptation            │ Algorithmic Fairness         ││
│  │  Following · 0 atoms yet         │  Recommended · why?          ││
│  │  Updated yesterday               │  ●●●●●                       ││
│  │  ●●● ● ●                         │                              ││
│  │                                  │ Cross-disciplinary HCI       ││
│  │ + Browse all (8 yours)           │  Stretch you · why?          ││
│  │                                  │  ●●● ●                       ││
│  │                                  │                              ││
│  │                                  │ + Browse all                 ││
│  └──────────────────────────────────┴──────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**关键细节**：
- **左轨 "Yours"**：你**参与过 + Following 但未贡献**的 workshops 混在一起，每张卡上 badge 区分（"Contributor" 绿点 / "Following" 黄点）。这是你确认的二分区方案。
- **右轨 "Explore"**：3 类标签 chip：
  - **Recommended**（With You）：与 profile 高相关
  - **Active now**（Hot）：最近 24h 高活跃
  - **Stretch you**（来自 lit review G3 反 identity-anchoring）：与 profile 距离较大但社区活跃
- 每张卡显示：标题 / badge / contributor 数量 dots（不是数字 — 视觉强度）/ 最近更新时间 / "why?" 链接（可展开看推荐理由——透明度，呼应 lit review G3 风险 #7）。
- 无渐变、无 emoji、无 dashboard chrome——保持你的"研究笔记本"美学（F3）。
- "+ Browse all" 通向完整列表视图（次要 surface，不在 MVP P0）。

**Delta from demo**：
- 原 demo 是网格 lobby，无 explore vs yours 分轨。新设计明确双轨。
- 原 demo 卡上有色点表示参与者颜色——保留，但 shadow lighter。

### C.2 · Workshop Canvas — Overview level（zoom out 默认入口）

```
┌──────────────────────────────────────────────────────────────────────┐
│ 〇 Atomic ideation  · Lobby > AI for Education      🔍   🔔   S      │
├──────────────────────────────────────────────────────────────────────┤
│                                            [Fit] [Filter] [▢ Insights]│
│                                                                      │
│                                                                      │
│   ╭─ Topic: Adaptive Tutoring ──────╮  ╭─ Topic: Equity & Access ─╮ │
│   │                                  │  │                          │ │
│   │   ◎ Adaptive Scaffolding         │  │  ◎ Linguistic Diversity  │ │
│   │     ●●●● ●● 24 atoms             │  │     ●● 8 atoms           │ │
│   │     ░░░░░░░░░ 86% mature         │  │     ░░ 32% mature        │ │
│   │                                  │  │                          │ │
│   │   ◎ Metacognition Support        │  │  ◎ Bias Audit Tools      │ │
│   │     ●●● 12 atoms                 │  │     ●●● 14 atoms          │ │
│   │     ░░░░ 45% mature              │  │     ░░░ 38% mature       │ │
│   │                                  │  │                          │ │
│   │   . . floater . .  ◌  ◌          │  │  ◌  . floater .          │ │
│   │     · ·  ◌  · ◌                  │  │    ◌                     │ │
│   ╰──────────────────────────────────╯  ╰──────────────────────────╯ │
│                                                                      │
│              ⋮  bridge atoms drift between topics                    │
│                                                                      │
│   ╭─ Topic: Teacher Workflows ──────╮  ╭─ Topic: Assessment ──────╮ │
│   │   ◎ Lesson Planning AI           │  │  ◎ Continuous Assessment │ │
│   │     ●●● 16 atoms                 │  │     ●● 10 atoms          │ │
│   ╰──────────────────────────────────╯  ╰──────────────────────────╯ │
│                                                                      │
│  ┌──────────────────────────────────────────────────┬────────┬─────┐│
│  │  🎤  Hold to speak ·  or type:                   │ AI     │ Send││
│  │                                                   │ assist │     ││
│  └──────────────────────────────────────────────────┴────────┴─────┘│
└──────────────────────────────────────────────────────────────────────┘
```

**关键细节**：
- **Topic 区域**用淡色块（每个 Topic 有自己的 hue）+ 圆角 dashed 边框（隐喻 vessel，但克制）。这是 §5.1 你定的"中度物理感"中的"暗示"档。
- **Subtopic 是泡泡**：圆形/椭圆形手绘感外形（见 §C.3 hover 状态），上面显示标题、原子数 dots、maturity 进度条。default 是收着的概要状态。
- **Floater 原子**散在 Topic 区域内的负空间（即 vessel 内未聚类的 atoms）；跨 Topic 的 bridge atoms 漂在 Topic 之间的中性地带。
- **Maturity meter** 是 ░░░░░░░░░ 字符条（可换为 SVG 进度条），不是数字百分比为主——视觉感优先。
- **顶部右侧三个按钮**：
  - `Fit` — auto-fit camera 到所有 Topic
  - `Filter` — toggle 隐藏 AI 原子 / 隐藏背景颜色 / 隐藏特定 reaction 类型
  - `▢ Insights` — 折叠/展开右侧 AI Insights 抽屉（不是默认显示，避免文本墙）
- **底部 Dock**：
  - 主交互是 `🎤 Hold to speak`（语音为主）
  - 右侧有键盘输入区（可补充打字）
  - "AI assist" 是一个次要按钮，触发 AI **针对当前选中 atom** 给建议——不是让 AI 凭空生成（C2 约束）
- **轻量物理感**（§5.1 中度档）：floater 在 vessel 内有微微 brownian 漂动（每 atom 一个独立的 sin/cos 振荡，amplitude 1-2px，period 5-10s）；这是设计语言的一部分，**不是花哨动效**——目的是让画布"活着"而不死板。

**Delta from demo**：
- 原 demo 的 subtopic 是圆角矩形卡，新设计是椭圆"泡泡"。
- 原 demo 的 AI Summary rail 默认展开 → 新设计默认折叠（D4 你的明确要求："不要 AI 文本墙"）。
- 原 demo 的 dock 主要是文字输入 → 新设计 dock 主要是 mic。

### C.3 · Subtopic Bubble — Hover 状态

当鼠标 hover 在某个 subtopic bubble 上 250ms（hover delay 防误触）：

```
        ╭──── Adaptive Scaffolding ────╮
        │                              │
        │   "How tutors should scale   │
        │    their support up and down"│
        │                              │
        │   24 atoms · 6 voices         │
        │   12 lit refs · 8 connections│
        │                              │
        │   contributors:              │
        │   ● ● ● ● ●  +1               │
        │                              │
        │   ░░░░░░░░░ 86% mature       │
        │                              │
        │     [ click to enter →]      │
        ╰──────────────────────────────╯
```

**关键细节**：
- Hover **250ms delay** 后浮现（防鼠标飘过误触发，呼应 Q3 你的 click 主张）。
- Tooltip 是**手绘感椭圆边框**（§5.2 候选 c），尺寸约 280×260px。
- 内容：
  - subtopic 标题（Newsreader serif）
  - 一行 framing（italic serif，浅色）
  - 关键 metrics（atoms / voices / lit / connections）
  - 贡献者颜色 dots（最多 5 个 + "+N" 表示更多）
  - Maturity meter
  - "click to enter" 提示
- 鼠标移开 → 200ms 后 tooltip 消失。
- **不展开也不切页**——这是 hover 状态的全部。

### C.4 · Subtopic Bubble — Expanded（戳破后）

用户点击 bubble，触发"戳破"动效（约 400ms）：bubble 形状先轻微震一下（像被戳），然后向外扩张到约 1100×680px（按你的"单页面、可伸缩"要求 §C3）。

```
┌──────────────────────────────────────────────────────────────────────┐
│  ✕  back to overview                                                 │
│                                                                      │
│  ╭──────────────────────────────────────────────────────────────────╮│
│  │  Adaptive Scaffolding                              ░░░░░░ 86%    ││
│  │  How tutors should scale their support up and down               ││
│  │                                                                  ││
│  │  ┌──────────────┬─────────────────────────────────────────────┐  ││
│  │  │              │                                             │  ││
│  │  │ FRAMING      │            atom canvas                      │  ││
│  │  │              │                                             │  ││
│  │  │ Tutors that  │     ◉ ─── ◉                                │  ││
│  │  │ meet learners│     │ build│                                │  ││
│  │  │ where they   │     ▼ -on  │                                │  ││
│  │  │ are — and    │     ◉ ⚡⚡ ◉  ←challenge (zigzag)            │  ││
│  │  │ step back    │       │                                     │  ││
│  │  │ when they    │       │ cite                                │  ││
│  │  │ shouldn't.   │       ▼                                     │  ││
│  │  │              │     ◇ Lit (Vygotsky 1978)                  │  ││
│  │  │ TENSIONS     │                                             │  ││
│  │  │ • teacher vs │     ⚪ AI: "These two pull on the same      │  ││
│  │  │   student-led│        question — see Maya's atom"          │  ││
│  │  │              │      ┊ (suggested key, dim, pending)        │  ││
│  │  │ OPEN Qs      │                                             │  ││
│  │  │ • who controls│     ⌒                                       │  ││
│  │  │   when to fade│   floater zone (atoms not yet bound)       │  ││
│  │  │              │                                             │  ││
│  │  │ LIT          │                                             │  ││
│  │  │ ◇ Vygotsky'78│                                             │  ││
│  │  │ ◇ Wood'76    │                                             │  ││
│  │  │              │                                             │  ││
│  │  │ ────         │                                             │  ││
│  │  │ [Compose      │                                             │  ││
│  │  │  proposal]   │                                             │  ││
│  │  └──────────────┴─────────────────────────────────────────────┘  ││
│  ╰──────────────────────────────────────────────────────────────────╯│
│                                                                      │
│  ┌──────────────────────────────────────────────────┬────────┬─────┐│
│  │  🎤  Hold to speak ·                              │ AI     │ Send││
│  └──────────────────────────────────────────────────┴────────┴─────┘│
└──────────────────────────────────────────────────────────────────────┘
```

**关键细节**：
- **左栏 (≈300px)**：
  - **Framing** 段（serif 字体，italic 深色）— 1-2 句话的 subtopic 框定，由 AI 从 atoms 整合产出，但**用户可编辑**（呼应 G2：AI 可整合不可独裁）
  - **Tensions** — bullets 列出 subtopic 内部的关键张力（来自 Support↔Challenge 关系网络的检测）
  - **Open Questions** — bullets 列出尚未被回答的 Question 关系所指向的 atoms
  - **Lit** — 文献原子的列表（Newsreader serif 标题 + 作者）
  - **Compose proposal 按钮**——只有 maturity 达标时 active，否则灰
- **右栏 (atom canvas)**：
  - 三类原子按物理坐标摆放
  - **化学键**（reactions）作为 SVG path 连线，五种风格各异（详见 §C.5）
  - **AI 幽灵键** dim 显示（颜色饱和度 30%、虚线）
  - **floater zone** 在右下角圆形虚线区域，atoms 漂浮其中
  - **AI 原子**（圆角 + 浅光晕）总是连着至少一个其他 atom（C2 约束）
- **底部 Dock**：与 overview level 一致，但语音输入会路由到当前展开的 subtopic（atoms 优先 fly 到这里）
- **戳破动效**（约 400ms）：
  - 0-100ms: bubble 形状轻微震动（scale 1.0 → 1.04 → 0.98 → 1.0）
  - 100-300ms: bubble 向外扩张，其他 bubble 与 Topic 区域 dim 到 18% opacity（不消失，仍可见）
  - 300-400ms: 内部 atoms 与 reactions fade-in
- **退出**：点 ✕ / 点其他 bubble / 按 ESC——逆向动效，约 250ms

**Delta from demo**：
- 原 demo 用 1150×760 + 2 列布局，新设计 1100×680 + 同 2 列布局，但泡泡形状从矩形变手绘椭圆。
- 原 demo subtopic detail 是覆盖式的全屏，新设计是**就地展开**（其他 bubble dim 但仍可见）。
- 新增 AI 幽灵键的可视化。

### C.5 · 化学键（Reactions）的视觉系统

> 你明确说"reaction 的类型你需要考虑一下有哪些类型，并根据它的类型设计直观的连接的键的展现形式"，并喜欢"冲突用尖锐折线"。下面是我的提案。

| 类型 | 含义 | 视觉 | Edge style |
|----|----|----|----|
| **Support** | A 支持 / 加强 B 的论点 | 绿色平滑曲线 | 柔和实线，2px，无箭头（双向暗示） |
| **Challenge** ⚡ | A 反驳 / 挑战 B | **红色尖锐 zigzag**（保留） | 折线，2.5px，锯齿振幅 6px |
| **Build-on** | A 在 B 基础上延伸 | 蓝色实线带箭头 | 实线，2px，A → B 单向箭头 |
| **Question** | A 对 B 提问（求澄清，非反对） | 黄色虚线，末端有 ? 符号 | dashed，1.5px，A → B |
| **Cite** | A 由文献 B 锚定支撑 | 紫色细实线 | 实线，1.5px，B 必须是 lit atom，A → B |

**视觉设计原则**：
- 所有键都 SVG path，dragging atoms 时 path live update（沿用原 demo 的实现）。
- **Challenge 的 zigzag** 是你最喜欢的视觉——保留并加强：振幅 6px（原 demo 偏小）、red 饱和但非刺眼（#C84A3D）。
- **AI 幽灵键** 与上述 5 类同形态，但：饱和度 30%、stroke-dasharray "4 4"（即使原本是实线）、旁边出现一个浮窗"[✓ Accept] [✗ Reject]"（hover 该键时浮现）。
- 一对原子可以**同时有多种关系**——多条键并行画，互相 offset 几像素避免重叠。

**键的方向**（重要）：
- Support / Challenge / Build-on / Question / Cite **都是有向**的（A → B），A 是新的或 dependent，B 是 anchor。
- 视觉上箭头是否显示由类型定（见上表）；后台数据始终有方向。

🧠 **Claude 推断**：未来可加 **Bridge** 类型（跨 Topic 的弱关联），但 MVP 不加，避免类型膨胀。

### C.6 · Streaming Atomization Dock（核心创新 C1 的视觉呈现）

这是最重要的新交互之一。需要详细 spec。

**默认状态**（不在录音）：
```
┌────────────────────────────────────────────────────────────┬────┬────┐
│  🎤  Hold to speak  ·  or type your thought:               │ AI │Send│
└────────────────────────────────────────────────────────────┴────┴────┘
```

**录音中状态**（按住 mic 或点击 mic 切换为持续录音）：

dock 上方**升起**一个细长 ribbon（约 60px 高），分两区：

```
       ╭──────────────────── thinking stream ─────────────────────╮
       │                                                          │
       │  ▁▂▃▅▇▆▄▂  "I think metacognitive prompts can          │
       │  ░░░░░░░░   actually backfire for low self-efficacy..."  │
       │                                                          │
       │              ⚪ atom emerging:                            │
       │              "metacognitive prompts may backfire"         │
       │                              for low self-efficacy        │
       │                              students                     │
       ╰──────────────────────────────────────────────────────────╯
┌────────────────────────────────────────────────────────────┬────┬────┐
│  ⏺ recording...                                             │    │stop│
└────────────────────────────────────────────────────────────┴────┴────┘
```

**逻辑**：
1. 用户按住 mic（或 toggle 到持续模式）开始讲。
2. 顶部 ribbon 出现：
   - 左侧：实时**音频波形**（wave form animation）
   - 中部：实时**转写文字**（fading in，旧文字 fade out）
   - 右侧：AI 正在识别的**emerging atom 候选**（淡灰半透明卡片，1-3 个同时存在）
3. 当一个 atom 候选稳定（AI 置信度 > threshold，约 0.8）：
   - 该候选卡片**飞向画布**对应位置（subtopic 内 / floater 区 / 跨 topic 区）——这是你 §F5 强调的 flying animation
   - 飞行轨迹：贝塞尔曲线，约 600ms，途中带轻微随机晃动（physical feel）
   - 落位时短暂高亮（pulse），落位后即成为正式 atom
4. 用户停止录音 → ribbon 消失，dock 回到默认状态。
5. **不存在"未确认状态"**（你 §1.1 的明确决定）。Atoms 直接成为正式 atoms，用户不满意可以**事后**点 atom 编辑 / 删除 / 重归类。

**键盘输入并行支持**：
- 默认 dock 的右半边一直有一个文本输入框
- 用户可以随时打字补充（不需要切换模式）
- 打完按 Send → 同样触发 atomization + 飞行（但没有 ribbon 的转写过程，只有 atom 候选 → 飞）

**用户干预（事后）**：
- 任何 atom 都可以：
  - 双击 → 抽屉显示原始语音段落 + AI 拆分理由 + 编辑按钮
  - 拖拽 → 改变物理位置 / 改变归属（拖到另一个 subtopic）
  - 右键 → 删除 / 合并 / 拆分

**Delta from demo**：
- 原 demo 的 atomize 是 batch modal（输入完打开 modal 预览）→ 新设计完全 inline streaming
- 原 demo 没有"边讲边看 atom 飞出"的体验

### C.7 · Onboarding Tour（profile-driven canvas tour）

这是核心创新 C3 的具体形式。它**覆盖**在 Workshop Canvas 之上，**不**是另一个页面。

**触发条件**：
- 首次进入某 workshop 时自动询问"想让我带你走一圈吗?"
- 或用户在 Canvas 上 30 秒不动 + 没有交互行为时，AI 提示"need a hand?"
- 或用户主动点 top nav 的"? Tour"

**Tour 期间的 UI overlay**：

```
                            ┌──────────────────────────┐
                            │  🎙 AI guide              │
                            │                          │
[ Workshop Canvas dimmed ]  │  This subtopic explores  │
                            │  how tutors should       │
                            │  adjust support based    │
                            │  on student state. It    │
                            │  has a tension you've    │
[ camera moves to a         │  written about — fixed   │
  specific subtopic ]       │  vs adaptive.            │
                            │                          │
                            │  Want me to zoom in?     │
                            │                          │
                            │  [ yes ]  [ next ]       │
                            │  [ exit tour ]           │
                            │                          │
                            │  💬 ask anything         │
                            └──────────────────────────┘
```

**关键细节**：
- AI guide 卡片浮在右上角，约 280×360px
- 卡片不遮挡画布主体（画布自动 dim 到 60% 凸显焦点 subtopic / topic）
- AI 文本**短**（< 50 字一段），呼应 D4"不要文本墙"
- 下方 3 个按钮：
  - `[yes]` — 镜头继续 zoom in 到下一层
  - `[next]` — 跳到推荐路径上的下一个 stop
  - `[exit tour]` — 退出 tour，回到自由探索
- 底部 `💬 ask anything` 是关键：用户可以**语音追问**（呼应 D2），如"有没有关于 metacognition 的内容?"——AI 解析后镜头跳到对应位置
- Tour 路径不是固定的——AI 根据 profile + 用户当前响应动态调整下一个 stop（呼应 D5）
- Tour 通常 3-5 个 stop（不超过 5 分钟），以"want to share a thought?" 收尾，引导用户首次贡献

**Empty zone 提示**（D5）：
- Tour 结束后用户自由探索时，如果某 Topic 的某区域较空（atoms 数量低于 threshold），AI 会浮出一张轻量提示卡片：
  > "No one has explored {empty subtopic} much yet. Your background suggests you might have something to add. Want to try?"
- 用户点"try" → 该位置自动成为 streaming atomization 的目标位置

**Delta from demo**：
- 原 demo 有 multi-step modal Onboarding 介绍系统 — 完全替换为 in-canvas tour
- 完全不再有"AI 文本总结栏"作为 default surface

### C.8 · 右侧 AI Insights 抽屉（默认收起）

这个是为了**老用户深入查看**用的，不是首屏 default。

```
                                                ┌─ AI INSIGHTS ─────┐
                                                │  conf 78%         │
                                                │                   │
                                                │  TENSION          │
                                                │  Constructive     │
                                                │  tension between  │
                                                │  Adaptive and     │
                                                │  Metacognition    │
                                                │  subtopics.       │
                                                │  [ jump → ]       │
                                                │                   │
                                                │  CONVERGENCE      │
                                                │  3 floaters in    │
                                                │  Equity converge  │
                                                │  on "language     │
                                                │  bias in tutors"  │
                                                │  [ crystallize ]  │
                                                │                   │
                                                │  EDGE POTENTIAL   │
                                                │  Sarah's new atom │
                                                │  may build-on     │
                                                │  Maya's "fade-out │
                                                │  protocols"       │
                                                │  [ accept key ]   │
                                                │                   │
                                                │  ─── since last ──│
                                                │  3 new atoms      │
                                                │  1 new connection │
                                                │  [ play diff ]    │
                                                └───────────────────┘
```

**关键细节**：
- 默认 collapsed 为右边一个细 tab（"▢ Insights"）
- 点击展开为 320px 宽抽屉
- 抽屉打开时画布 right inset 自动调整（修复 demo 的 §G2 bug）
- 内容分模块：Tensions / Convergence (Crystallization candidates) / Edge potential (suggested keys queue) / Since last visit
- 每模块都有 actionable 链接（jump / crystallize / accept key / play diff），不止是文字
- 这就是你说的"AI 不能是纯文本墙"——每条 insight 都连着可执行操作

### C.9 · 个人 Dashboard（top nav 入口）

```
┌─────────────────────────────────────────────────────────────────┐
│  Sarah Chen · Personal Dashboard                                │
│                                                                 │
│  YOUR ATOMS (12)                  WHO YOU'RE WITH               │
│  ────────                         ─────────                     │
│   AI for Education         8       ● Maya (5 cross-builds)      │
│   Climate Adaptation       4       ● David (3 supports)         │
│                                                                 │
│   recently:                       WHO YOU MIGHT STRETCH WITH    │
│   ◉ "Metacog prompts may backfire"  ○ Hyun-jung (CS, design)   │
│     in Adaptive Scaffolding         ○ Ravi (econ)              │
│     · 3 supports · 1 challenge                                  │
│                                                                 │
│  YOUR REACH                       PROPOSALS YOU'RE IN           │
│  ─────                            ─────                         │
│   + 8 atoms cited yours            ⌒ Adaptive Scaffolding (draft)│
│   + 12 atoms built on yours          contributors: 6  · 86% ready│
│   + 3 connections you proposed                                  │
│                                                                 │
│   most-cited atom:                                              │
│   ◉ "fade-out protocols should..."                              │
└─────────────────────────────────────────────────────────────────┘
```

**关键细节**：
- 双轨 collaborator 推荐（With You / Stretch You），呼应 lit review G3 反 identity-anchoring 设计。
- Reach metrics（被引 / 被 build-on / 提议的连接）量化"我的影响"，呼应你的"用户能看见自己贡献"诉求。
- Proposals 列表显示用户参与的 in-progress proposals。
- 这个 surface 是 overlay（点 top nav 进入），不是独立页面。

---

## Part D · 交互流（state diagrams + 动效 spec）

### D.1 · Streaming voice-to-atom 状态机

```
   ┌─────────────┐
   │ DOCK_IDLE   │  默认：mic icon 静态，文本输入框可用
   └─────┬───────┘
         │ press mic / hotkey 'M'
         ▼
   ┌─────────────┐
   │ RECORDING   │  ribbon 升起（300ms slide-in）
   │             │  音频流接 STT API
   └─────┬───────┘
         │ STT 返回新转写片段
         ▼
   ┌─────────────┐
   │ TRANSCRIBING│  ribbon 中部文字滚动；AI 后台分析
   └─────┬───────┘
         │ AI 识别出 atom 候选 (confidence > 0.8)
         ▼
   ┌─────────────┐
   │ ATOM_BIRTH  │  右侧候选卡出现 (淡灰半透明)
   └─────┬───────┘
         │ 200ms 后 (或 candidate stable)
         ▼
   ┌─────────────┐
   │ ATOM_FLY    │  候选飞向画布 (600ms 贝塞尔)
   └─────┬───────┘
         │ 落位
         ▼
   ┌─────────────┐
   │ ATOM_LANDED │  pulse 高亮 800ms，正式成为 atom
   └─────┬───────┘
         │ 用户继续讲 → 回到 RECORDING
         │ 用户停止 → 回到 DOCK_IDLE (ribbon slide-out)
         │ 用户事后修改 → ATOM_EDITED (可双击/拖拽/右键)
```

**关键时间常数**：
- STT chunking interval: 500ms
- AI atom-candidate emission threshold: confidence ≥ 0.8 OR sentence boundary
- Candidate hold time: 200ms (用户可在此时口头自纠"不对，我是说……" → 候选撤回)
- Fly duration: 600ms (Bezier (0.4, 0, 0.2, 1) easing)
- Landing pulse: 800ms (scale 1.0 → 1.06 → 1.0 + halo)

🧠 **Claude 推断**：用户讲话时如果说"不对" / "实际上" / "重来" 等修正词，AI 检测到后撤回最近的 candidate（这是隐藏的"无未确认状态但允许在途纠错"的折中方案）。这条值得你确认。

### D.2 · Bubble 戳破式展开状态机

```
   ┌─────────────┐
   │ COLLAPSED   │  default: 椭圆 bubble + 概要
   └─────┬───────┘
         │ mouse enter (250ms hover delay)
         ▼
   ┌─────────────┐
   │ HOVERED     │  tooltip 浮现 (200ms fade-in)
   └─────┬───────┘
         │ click
         ▼
   ┌─────────────┐
   │ POPPING     │  bubble 震动 (100ms) + 扩张 (300ms)
   │             │  其他 bubble dim 到 18%
   └─────┬───────┘
         │ animation done
         ▼
   ┌─────────────┐
   │ EXPANDED    │  完整内部可见，原子可拖
   └─────┬───────┘
         │ click ✕ / click 其他 bubble / press ESC
         ▼
   ┌─────────────┐
   │ COLLAPSING  │  逆向动效 (250ms)
   └─────┬───────┘
         │
         ▼
   ┌─────────────┐
   │ COLLAPSED   │  回到默认
   └─────────────┘

   tooltip:
   ┌─────────────┐
   │ HOVERED     │ → mouse leave (200ms delay) → COLLAPSED
   └─────────────┘
```

**关键细节**：
- Hover delay 250ms 是关键——避免鼠标飘过乱跳
- "戳破"动效是设计语言的核心比喻，必须有触觉反馈感（可加细微的"啵"音效，可选）
- 同一 Topic 内只能有一个 bubble expanded，第二次 click 自动 swap

### D.3 · AI 幽灵键建议流

```
   后台持续监测：每 N 秒 / 每次新 atom 落位 / 每次 reaction 添加后
         │
         ▼
   AI 计算：所有 atom-pair 之间的潜在 reaction (5 类) 概率
         │
         │ 过滤：confidence > 0.7, 且当前 subtopic 内
         ▼
   ┌─────────────────┐
   │ GHOST_PENDING   │  画布上画出 dim 虚线键 (饱和度 30%)
   └─────┬───────────┘
         │ 用户 hover 该键
         ▼
   ┌─────────────────┐
   │ GHOST_REVEALED  │  键旁浮现 [Accept] [Reject] 按钮
   │                 │  + AI 简短理由 (2 行)
   └─────┬───────────┘
         │ click Accept
         ▼
   ┌─────────────────┐
   │ KEY_CONFIRMED   │  幽灵键变成正式键 (实色，5 类对应样式)
   └─────────────────┘
         │ click Reject
         ▼
   ┌─────────────────┐
   │ KEY_DISMISSED   │  幽灵键消失，AI 记录该建议被拒
   └─────────────────┘

   所有未交互的 GHOST_PENDING 在 30 分钟后自动 dismiss
```

**关键细节**：
- 避免画布乱：**同时只显示 Top 5 个置信度最高的幽灵键**
- 其余的幽灵键候选堆积在右侧 Insights 抽屉的"Edge potential"模块
- 接受 / 拒绝都成为 AI 的 feedback signal，未来 surfacing 更准（这是机制创新 C2 的工程闭环）

### D.4 · Crystallization 流（floater 聚类→新 subtopic）

```
   后台：AI 持续监测 floater 区域内的语义聚类
         │
         │ 检测到 ≥ 3 个 floater 相似度 > threshold
         ▼
   ┌─────────────────┐
   │ CLUSTER_HINTED  │  这些 floaters 周围画一个 dashed halo
   │                 │  halo 旁边浮现 "Crystallize as new subtopic?" 按钮
   └─────┬───────────┘
         │ 任意贡献者点击 Crystallize
         ▼
   ┌─────────────────┐
   │ CRYSTALLIZING   │  动画：floaters 向中心聚拢 + bubble 形成
   │                 │  约 1500ms
   └─────┬───────────┘
         │ animation done
         ▼
   ┌─────────────────┐
   │ NEW_SUBTOPIC    │  新 bubble 在 Topic 区域内出现
   │                 │  AI 提议一个 subtopic 标题 (用户可改)
   │                 │  原 floaters 现在成为该 subtopic 的初始 atoms
   └─────────────────┘
         │ 所有相关贡献者收到通知 "你的 atom 现在在新 subtopic '{name}'"
```

**关键细节**：
- 这是你 §Q4 选定的"AI 推荐 + 任人可接受"模式
- 新 subtopic 的标题是 AI 建议的，但创建者可以编辑（不锁定）
- 通知所有 contributor —— provenance 不丢失

### D.5 · Onboarding tour 流

```
   ┌─────────────────┐
   │ TOUR_OFFERED    │  首次进入 workshop 时浮出 "want a tour?"
   └─────┬───────────┘
         │ click Yes
         ▼
   ┌─────────────────┐
   │ TOUR_STOP_1     │  AI 选最相关 Topic, 镜头 zoom + 简短旁白
   └─────┬───────────┘
         │ click [yes] zoom in / [next] swap topic / [voice ask] 用户追问
         ▼
   ┌─────────────────┐
   │ TOUR_STOP_2..N  │  AI 进入 subtopic level, 同样模式
   └─────┬───────────┘
         │ 3-5 stops 后
         ▼
   ┌─────────────────┐
   │ TOUR_INVITE     │  AI: "想说点什么吗?" + mic 高亮
   └─────┬───────────┘
         │ 用户开始说话
         ▼
   ┌─────────────────┐
   │ FREE_EXPLORE    │  Tour 结束, 用户进入正常使用
   └─────────────────┘

   any time: voice ask "有 X 的内容吗?"
         → AI 解析 → 镜头跳转 → 继续 tour 或停留
   any time: click [exit tour]
         → 立刻 free_explore
```

**关键细节**：
- 不强制完成 tour——任何时刻可 exit
- Tour 路径动态调整——AI 看用户响应（停留时间 / 追问内容）调下一站
- Voice query 与 tour stop 互通

---

## Part E · 视觉系统更新（delta from demo）

### E.1 · 字体（更新）

| 用途 | 字体 | 替换 |
|----|----|----|
| UI / atom body | **Inter** (主) | （保留） |
| Atom title (人类) | Caveat 或 Architects Daughter（仅 1-2 字短标题） | 替换原 Caveat 用于 body |
| Subtopic title / framing / lit | Newsreader (serif) | （保留） |
| 元数据 / mono | JetBrains Mono | （保留） |

**Delta**：原 demo 把 Caveat 用在所有人类 atom body，可读性差。新设计 body 完全用 Inter，**仅在 atom 标题这种 1-3 字的高亮**位置用手写体——这是你 Q2 选的"Inter 为主，原子标题用手写体强调"。

### E.2 · 配色（保留 + 微调）

完全保留 demo 现有配色（你 §F1 确认）：
- 背景 paper #FAF8F4
- 卡面 #FFFEFB
- 文本 #1B1A17 / #3A3833 / #6B6760 / #A09B92
- User 颜色 6+1 (rose / sage / ocean / amber / violet / clay / you-slate)
- Reaction 颜色 5 (support green / challenge red / build-on blue / question yellow / cite violet)

**Delta**：仅 Challenge 红的饱和度上调一点（demo 偏粉，应更"血"），衬托尖锐折线。

### E.3 · 物理感

| 元素 | 默认状态动效 |
|----|----|
| Floater atom | 微 brownian (amplitude 1-2px, period 5-10s) |
| Bubble | rest 时静止；hover 后轻微脉动 (scale 1.0 ↔ 1.02, 2s loop) |
| Atom 内部 (subtopic 展开后) | 静止；只在 drag 时跟随 |
| AI 原子的光晕 | 缓慢 breathe (opacity 0.6 ↔ 1.0, 4s loop) |

**Delta**：原 demo 的 atom hover wobble (§G1 已知 bug) 完全去掉。所有动效都"低调但活着"。

### E.4 · 飞行动效（关键）

- Atom 出现（streaming）：贝塞尔曲线从 dock 飞向画布，600ms
- Atom 拖拽：1:1 跟手，无延迟
- Bubble pop：scale 序列 1.0 → 1.04 → 0.98 → 1.0 (100ms) + 扩张 1.0 → 3.5x (300ms)
- Bubble collapse：扩张 → 缩回 (250ms ease-in)
- 幽灵键 reveal：opacity 0.3 → 1.0 + dasharray 收缩为实线 (300ms)

---

## Part F · 与现有 Demo 的迁移路径

按你"demo 只是非常初期早期的测试版本"的明确表态，下面给出关键迁移点：

| 现有 demo 元素 | 新设计动作 |
|----------|--------|
| screen-lobby.jsx (单轨网格) | **重构**为双轨 hero (Yours / Explore) |
| screen-domain.jsx (canvas + 矩形 subtopic) | **保留 canvas** + 替换 subtopic 形态为椭圆 bubble + 新增戳破动效 |
| screen-atomize.jsx (modal 预览) | **完全替换**为 inline streaming ribbon (§C.6) |
| AI Summary rail (默认开) | **改为 collapsed Insights 抽屉**，默认关 |
| Caveat 在所有人类 atom body | 仅保留为标题字体 |
| Onboarding 多步 modal | **替换**为 in-canvas tour (§C.7) |
| 假的 crystallize 按钮 | 实装 §D.4 流程 |
| 五种 reaction edges (已有) | 视觉保留，但 Challenge 折线加强；新增**幽灵键**呈现层 |
| 个人 Dashboard / Proposal / Collab (已有 overlay) | 保留架构，按 §C.9 微调内容 |

---

## Part G · 与 Literature Review 的对照（Why this design wins the paper claim）

| Lit Review G | 设计如何兑现 |
|----------|--------|
| G1 三类原子视觉差异 | C.4 + C.5 + E.1：人类（Inter + 微旋转）、文献（serif + 印刷spine）、AI（圆角 + 光晕）三种视觉语言 |
| G2 AI as connector | **C.5 幽灵键 + D.3 状态机** —— AI 唯一的 atom-level 输出是建议 reaction，不能产 atom。这是**直接回答 Anderson et al. 同质化批评的界面级机制** |
| G3 视角作为一阶变量 | C.1 双轨推荐 + C.4 atom 颜色编码 + C.9 With/Stretch You 双轨 collaborator |
| G4 newcomer 低成本入场 | **C.7 onboarding tour 完全替代文本墙** + B.2 deep link + "since last visit" diff |
| G5 涌现式聚类 + floater | C.4 floater zone + D.4 crystallization 实装 |

每一个 G 都有可指认的具体设计——这是 paper 的 contribution table 直接素材。

---

## Part H · 待解决的开放问题（next round if any）

写在这里方便你和 Yun 后续讨论时定夺，**不影响 v1 设计文档完整性**：

1. **AI 在用户讲话时的 mid-stream "self-correction" 检测**（D.1 我标 🧠 的部分）—— 是否要支持？
2. **跨 workshop 的"桥接 atom"概念** —— 一个 atom 能否同时属于多个 workshop？
3. **匿名贡献模式**（lit review §11.1 提到）—— MVP 是否支持？
4. **Atom 的"绑定"关系**（lit review 风险 #1 提到）—— 用户能否标记"这两个 atom 必须一起读"？
5. **Tour 的"Voice query"语言支持** —— 仅英文 vs 多语言？
6. **Reaction 类型是否真的需要 5 种** —— Question 与 Challenge 是否可合并？需 user study 验证。
7. **化学键的"健康度"指标** —— 一个 atom 的 Support / Challenge 比例是否要量化为 visual signal？
8. **Bubble 内部 atom 的物理布局算法** —— force-directed 还是手动 / 半手动？

---

## Part I · 给原型实现的优先级（如果接下来要做开发）

**P0（必做，撑起 demo 叙事）**：
1. C.6 Streaming dock + 飞行动效 —— **核心创新 C1 的视觉证明**
2. C.5 + D.3 幽灵键流 —— **核心创新 C2 的视觉证明**
3. C.7 Onboarding tour 框架 + 1-2 个示范 stop —— **核心创新 C3 的视觉证明**
4. C.4 Bubble 戳破式展开 + atom 内部布局 + reaction edges
5. C.1 双轨 lobby

**P1（应做，撑起 user journey）**：
6. C.0 Profile boot (with mock Google Scholar) 
7. C.2 Workshop Canvas overview + topic regions + floater 区
8. D.4 Crystallization 实装
9. C.8 Insights 抽屉

**P2（选做，paper figure 用）**：
10. C.9 Dashboard
11. B.3 Proposal generation 流
12. Demo 数据 enrich（让 Adaptive Scaffolding 看起来真实可信）

---

## 附录 · 一句话给 Yun 的 elevator pitch（更新版）

> "我们的核心观察是：现有 LLM 协作 ideation 工具几乎都让 LLM 自由生成想法——而 Anderson et al. C&C 2024 等过去一年的实证一致表明这会**减少集体多样性**。我们提出 *Atomic Ideation* —— 一个多人异步研究 ideation 平台，通过三个**界面层面**的机制对抗这一问题：(i) **Streaming voice-to-atom** 让用户思绪流被实时拆解为可定位的最小单元；(ii) **AI-as-connector** 把 LLM 角色限制为'建议现有原子之间的关系'，不允许产生新原子——这是用界面机制对抗群体级同质化；(iii) **Profile-driven canvas tour** 用导游式交互替代 AI 文本墙，降低跨学科 newcomer 的认知成本。三件套在已有的 Sensecape、AI-Augmented Brainwriting、CoQuest、Idea-Catalyst 中没有任何一家同时占据。"
