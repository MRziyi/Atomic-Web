# Literature Review v1
## LLM 辅助多人协作研究构思系统的研究问题与叙事

**版本**: v1（初稿）
**日期**: 2026-05-04
**作者协作**: Zack 与 Claude（Cowork）
**适用阶段**: 开题 / introduction 草拟 / 与导师 (Yun) 对齐方向

---

## 0. TL;DR — 三句话讲清楚

1. **真问题**：当研究 ideation 从一个小团队的同步白板，扩展到一个研究社区的"长尾、跨时区、跨学科"接力时，三个失败模式同时被放大——新加入者认知成本爆炸、不同视角在合并中被稀释、LLM 的引入虽降低了表面成本却进一步加剧了同质化。文献证据齐全（IdeaHound 系统已 9 年没再有结构性突破；Anderson et al. C&C 2024、Doshi & Hauser 2024、Padmakumar & He 等同时实证了 LLM 群体级同质化；2025 综述 [Li et al.] 明确指出"群体异步 LLM ideation 工具仍极少"）。
2. **真 gap**：现有 LLM-augmented sensemaking/ideation 工具几乎全是单用户（Sensecape、Selenite、Graphologue、Luminate、ABScribe、Memolet、Cocoa），少量多用户工作（AI-Augmented Brainwriting、Collaborative Canvas、CoQuest）都是同步小团队，且让 LLM 直接产出想法，恰是同质化的助推器；前 LLM 时代的众包 ideation（IdeaHound、Crowdboard、Directed Diversity）解决了部分聚类问题但缺少 LLM 时代的多类内容（人类想法/文献/AI 输出）的共存机制与异步接力支持。
3. **可行的研究空间**：我们提出的"贡献最小单元 + 来源/视角可见 + AI 仅作为连接器（而非作者）"是一类**机制族**（不必锁死到具体的"原子化"形态），可作为对抗 LLM 同质化、保留 provenance、支持异步接力 onboarding 的设计原则被检验。这个机制族至少有 3 个尚未被任何已有系统同时满足的设计点。

---

## 1. 研究背景与问题

### 1.1 场景与目标用户

我们关注的是**领域级别的开放研究社区 ideation**——例如"AI for Education"这样的研究领域中，跨机构、跨时区、跨学科的研究者通过异步接力的方式，逐步把一个广域 Topic 演化为可执行的 Subtopic 与 Research Proposal。这个场景与下面几类相邻场景在四个维度上有结构性差异（这些差异决定了已有工具用不上）：

| 维度 | 我们的场景 | Workshop / 小团队 brainstorm | 单人 LLM brainstorm | 大众众包（如 arXiv 评论） |
|------|----------|-----------------------------|---------------------|---------------------------|
| 参与规模 | 数十到数百人 | 5-15 人 | 1 人 + LLM | 数百到数千匿名贡献 |
| 时间结构 | 异步、长尾、有接力 | 主要同步 | 单线程 | 异步但缺少结构 |
| 参与者画像 | 跨学科、有领域知识 | 同质化高 | N/A | 高度异质、低承诺 |
| 内容类型 | 人类想法 + 文献 + AI 整合 | 主要人类想法 | 主要 LLM 输出 + 人类筛选 | 短评论、票数 |

最贴近的现实参考是：CHI workshop 后的延伸讨论、跨实验室的研究 proposal 共建、DeSci/DAO-style 的研究社区（[Background: DAO vs Research Proposals]）、以及 arXiv 评论与 NeurIPS OpenReview。它们都不令人满意：要么变成"少数人主导 + 大多数沉默"，要么沦为"shallow comment 海洋"。

### 1.2 三条问题主线

经过初步证据扫描，我把项目可承接的"问题入口"收敛到三条互相增强的主线（以下文献综述按这三条展开）：

- **主线 A**：众包科研 ideation 的 coordination/quality 困境（low engagement、free-riding、fragmented coordination、shallow input、newcomer onboarding cost）
- **主线 B**：LLM 辅助 ideation 的同质化与锚定（group-level homogenization、creative fixation、token anchoring）
- **主线 C**：跨学科视角的"不可见性"——LLM 时代之前是 boundary objects 与 common ground 的老问题，LLM 时代被新问题加剧（"AI 把所有人的话压成一种声音"）

---

## 2. 文献综述

### 2.1 主线 A：众包科研 ideation 的 coordination/quality 困境

众包 ideation 在 HCI 有十余年传统。关键里程碑与失败模式：

**IdeaHound 谱系**——Siangliulue 等人在 UIST 2016 提出 IdeaHound，把"参与者自然的空间排列"作为 t-SNE 的输入，构建 emerging solution space 的 semantic model，从而克服外部 crowd 标注的 scalability 问题（[IdeaHound, UIST 2016](https://dl.acm.org/doi/10.1145/2984511.2984578)）；后续 Siangliulue 2017 [Self-sustainable Idea Generation](http://iis.seas.harvard.edu/papers/2017/siangliulue17supporting.shtml) 把这一思路扩展为 self-sustainable 系统。**这一脉络的核心遗憾**：它的语义模型是 crowd-powered（人手画语义关系），而非 LLM-powered；它没有处理多类内容的共存（人类想法 vs 文献 vs AI 输出），也没有 provenance / 视角可见性概念。这给我们留下了一块明确的延展空间。

**Crowdboard / Andolina**——[Crowdboard](https://www.semanticscholar.org/paper/Crowdboard%3A-Augmenting-In-Person-Idea-Generation-Andolina-Schneider/b0d2c39159c00b9cd981488180fadddab4a38895) 让远程众包小团队加入面对面 ideation，关注的是"同步增强"，未触及异步接力。

**Directed Diversity 谱系**——Chung & Adar 在 [CHI 2021](https://dl.acm.org/doi/10.1145/3411764.3445782) 用 language embedding distance 在 prompt 阶段把众包 ideators "推开"使其不重复；[CHI 2022 Interpretable Directed Diversity](https://dl.acm.org/doi/10.1145/3491102.3517551) 加入了模型解释帮助 ideator 改进。这两篇是"用语义距离对抗同质化"的范本，但**它们关注的是单人提交质量，不是多人协作的 provenance 与视角融合**。

**讨论森林的失败模式**——[Wikum (CSCW 2017)](https://people.csail.mit.edu/axz/papers/wikum.pdf) 直接命中我们关心的"长帖恐惧症"：当讨论增长到几万条时阅读者无法消化；它的方案是 recursive summarization，让一群读者轮流总结子树。**关键观察**：Wikum 默认讨论是树状的（reply 关系），但研究 ideation 不是回复结构，是观点的水平相邻关系；Wikum 的递归总结也不区分谁说了什么。

**Town hall / 集体反馈**——[CommunityClick (CSCW 2020)](https://groups.cs.umass.edu/hci-vis/wp-content/uploads/sites/33/2020/09/CommunityClick_CSCW2020_CR.pdf) 用 modified iClicker 让沉默参与者匿名发声，然后帮助 organizer 写更包容的 report。它处理了 reticent participation 但只在城镇会议这一窄场景。

**对 crowdsourcing for innovation 的元批评**——多个综述指出众包 ideation 反复栽在三个坑里：（1）crowd 大、信号噪声比低；（2）coordination 困难，"competing proposals"和"contradictory feedback"导致拖延；（3）voter apathy 与 free-riding，少数人主导（[Crowdsourcing Coordination Review](https://link.springer.com/chapter/10.1007/978-3-030-12334-5_2)；用户提供的 [DAO-Research Proposals 背景文档] 也总结了同样的失败模式）。

**这条主线的核心 gap（对我们最有用的）**：
- 没有任何工具同时处理"长讨论的 onboarding 成本下降"+"多元视角不被合并稀释"+"贡献者保留 ownership"。Wikum 解决了前者代价是后两者，IdeaHound 处理了 middle 但没有 newcomer 入口，Directed Diversity 是单人尺度。
- 异步接力（asynchronous relay）作为一种特定的协作模式，在 HCI 文献中长期缺席系统级支持。2025 综述 [A Review of LLM-Assisted Ideation](https://arxiv.org/abs/2503.00946) 明确指出："in group ideation, tools and interaction modalities targeting both synchronous and asynchronous collaboration are much scarcer."

### 2.2 主线 B：LLM 辅助 ideation 的同质化与锚定

这是过去两年 HCI/Cognitive Science/AI 三条战线**同时**实证爆发的方向。证据十分稳固：

**群体级同质化的实证证据**：
- Anderson, Shah, Kreminski (C&C 2024) [Homogenization Effects of LLMs on Human Creative Ideation](https://mkremins.github.io/publications/Homogenization_C&C2024.pdf)——36 人对照实验。**关键发现**："homogenization stems not from individual-level increases in fixation when working with the LLM, but from group-level suggestion of similar ideas to different users by the LLM."这意味着同质化是**系统性**的，不是个人意志能克服的。
- Doshi & Hauser (Science Advances 2024)——AI assistance 提高个人创意但减少集体多样性。
- Padmakumar & He——AI co-writing reduces semantic diversity in writing。
- [PNAS "Echoes in AI"](https://www.pnas.org/doi/10.1073/pnas.2504966122)——量化 LLM 输出的剧情多样性损失。
- [arXiv 2501.19361 "We're Different, We're the Same"](https://arxiv.org/html/2501.19361v1)——同质化甚至跨 LLM 模型，不是单个模型的问题。

**fixation / anchoring 的实证证据**：
- Nature HSSC 2025 [Inspiration booster or creative fixation?](https://www.nature.com/articles/s41599-025-05867-9)——双机制：复杂任务下 LLM 反而引发 creative fixation。
- arXiv 2505.15392 [Understanding the Anchoring Effect of LLM](https://arxiv.org/pdf/2505.15392) (ICLR HCAIR Workshop 2026)——LLM 的 token anchoring：早期生成的短语会约束后续输出，"requiring short titles rather than full ideas prevents early elaboration."
- [AnchoredAI (arxiv 2509.16128)](https://arxiv.org/abs/2509.16128)——anchored interface 提高了 writer agency 与 ownership，但 cognitive effort 也更高。Buschek 等近期亦在 [CHI'26 Preprints (HCI + AI) 综合](https://dbuschek.medium.com/chi26-preprint-collection-bdbfe9492a7b) 中持续追踪 anchoring/agency 相关的 AI-writing 工作。

**研究 ideation 专项的重要警示**：
- Si, Yang, Hashimoto [Can LLMs Generate Novel Research Ideas? (NeurIPS/ICLR 2025)](https://arxiv.org/abs/2409.04109)——LLM-generated 想法被评 *more novel* 但 *less feasible*；同时 LLM "lack diversity in generation"。
- Si et al. [The Ideation-Execution Gap (ICLR 2026)](https://arxiv.org/abs/2506.20803)——执行后翻盘：LLM 想法的所有指标（novelty, excitement, effectiveness, overall）都比专家想法降得更多。**含义**：表面新颖不代表有价值；系统不能止步于"让 LLM 输出大量 idea"。
- Liu et al. [Who Owns Creativity and Who Does the Work? (arxiv 2601.12152)](https://arxiv.org/abs/2601.12152)——三个 control level 实证：creativity-effort tradeoff 与 perceived ownership。**对我们的指引**："designing LLM agents for research ideation should empower scientists, allowing them to experience a greater sense of ownership over more powerful ideas, rather than reducing them to operators of a machine."

**已被尝试但不够的对策**：
- Persona-based prompting / multi-persona LLMs（[A Pattern Language for Persona-based Interactions](https://www.dre.vanderbilt.edu/~schmidt/PDF/Persona-Pattern-Language.pdf)）——通过让 LLM 扮演多个角色获取多视角；但这是**模拟**视角，不是真实人类视角。
- Pluralistic alignment（[ICML pluralistic-alignment workshop](https://pluralistic-alignment.github.io/)；[Modular Pluralism](https://www.researchgate.net/publication/381666714_Modular_Pluralism_Pluralistic_Alignment_via_Multi-LLM_Collaboration)）——技术侧的"让模型表征多样化"，但与协作系统脱钩。
- Divergent-Convergent personas（[arxiv 2510.26490](https://arxiv.org/html/2510.26490)；[arxiv 2512.23601](https://arxiv.org/html/2512.23601v1) "Divergent-Convergent Thinking in LLMs"）——模型层面的发散收敛切换，亦未与协作 UI 整合。

**这条主线的核心 gap**：
- 已有解法（更换 prompt、persona、温度参数等）已被实证**不能根本缓解 group-level 同质化**——Anderson et al. 明确指出参数与 prompt 调整无效。
- 真正的对策方向其实是**"约束 LLM 的角色"**：少让它生成原子想法，多让它做"连接、整合、解释"等结构性工作。这正是我们设计中"AI 原子必须依附于其他原子，不能凭空生成"这条约束的理论靠山。
- 没有任何已有系统**显式地用界面机制**禁止 LLM 充当原子想法的作者；这是一块清晰的 design space。

### 2.3 主线 C：跨学科视角的"不可见性"问题

这条线既古老又新鲜。古老一面来自 CSCW，新鲜一面来自 LLM 时代的"视角扁平化"。

**经典理论锚点**：
- [Olson & Olson "Distance Matters" (HCI Journal 2000)](https://dl.acm.org/doi/10.1207/S15327051HCI1523_4)——四要素：common ground、coupling of work、collaboration readiness、collaboration technology readiness。"distance still matters"已被 26 年的引用反复证实。
- Star & Griesemer 的 boundary objects 理论；[Nicolini, Mengis, Swan (Org. Science 2012) "Understanding the Role of Objects in Cross-Disciplinary Collaboration"](https://www.researchgate.net/publication/258438020_Understanding_the_Role_of_Objects_in_Cross-Disciplinary_Collaboration)——objects 在跨学科协作中扮演 *motivate / mediate / infrastructure* 三重角色。
- "Between Chaos and Routine" boundary negotiating artifacts。

**HCI 角度的现状**：HCI/CSCW 已经积累了关于"如何让多元视角在屏幕上可见"的大量散点工作（[2024 review on cross-disciplinary collaboration](https://dl.acm.org/doi/10.1145/3757594) 综述了 134 篇 CHI/CSCW/UIST 过去 20 年的 co-creative 论文），但落实到 LLM-augmented 协作 ideation 工具的具体机制时仍很贫乏。

**LLM 时代的新失败模式**——LLM 倾向于把不同来源的话压成一个 averaged voice：
- [LIVS: Pluralistic Alignment Dataset](https://arxiv.org/html/2503.01894)、[Policy Prototyping for LLMs](https://arxiv.org/html/2409.08622)——pluralistic alignment 把这个问题在模型训练侧明确化。
- 但 *interface 侧* 几乎没有相关探索：LLM 系统中默认所有 contribution 都被翻译成模型语言，再以模型语气输出，**视角源头被洗去**。

**与我们的设计直接相关的 provenance 文献**：
- He, Houde et al. [Which Contributions Deserve Credit? (CHI 2025)](https://arxiv.org/abs/2502.18357)——人们对 AI 协作中的 attribution 是 nuanced 的，需要 granular（不是 binary）。这给"AI 原子" 在视觉与归属上必须可辨支持理论根据。
- [The Provenance Problem: LLMs and the Breakdown of Citation Norms](https://arxiv.org/pdf/2509.13365)——LLM 让传统 citation 的可追溯性崩溃。

**这条主线的核心 gap**：
- 把"多元视角可见"作为协作 ideation 的 *一阶变量* 的 LLM 系统几乎不存在。最多在 collaborative writing 工具里有 author attribution（如 Google Docs），但这是后置的痕迹，不是前置的设计。
- 没有人把 boundary object 理论用 LLM 时代的 design language 重述。

---

## 3. Gap 分析（三条线的交集）

把三条线叠在一起，**未被同时满足的设计交集**包含至少 5 个点：

| 设计点 | 已有最近的工作 | 但它们做不到的部分 |
|-------|--------------|-------------------|
| **G1**. 把人类、文献、AI 的贡献作为同维度但视觉差异化的 *atom* 共存于一个画布 | Wikum（递归总结，但只有人类内容）；Sensecape（多层级，但单用户）；Collaborative Canvas（人 + LLM 共在 sticky notes，但没有文献维度，也没有强制的视觉区分） | 三类原子的**第一眼可辨**+ 文献作为论证锚点 + AI 受约束的角色，没人合在一起 |
| **G2**. 让 *LLM 仅作为连接器/整合者*，而不是原子想法的作者 | AI-Augmented Brainwriting 用 LLM 做 evaluator；CoQuest 让 LLM 提出 RQ | 两者都在让 LLM 直接产出新内容，恰是同质化原因 |
| **G3**. 让 *contributor background* 成为可视一阶变量，但同时给"对抗同质聚集"的反制（Stretch You 推荐） | Polis 把 contributor 聚成 cluster；Pluralistic alignment 在模型层 | 都没有"自动推荐异质同伴"作为系统机制 |
| **G4**. 异步接力下的 newcomer 低成本入场，**且不损失原始上下文** | Wikum 摘要（损失上下文）；Anchored AI 评论（但用于写作，非 ideation） | 摘要 + 原子双向链接 + "自上次以来"高亮，没合在一起 |
| **G5**. *Subtopic 涌现 + 成熟度信号 + Proposal 生成* 一体化的研究 ideation 闭环，且每段 Proposal 标注来源构成 | Idea-Catalyst 让 LLM 自己 inspire；CoQuest 输出 RQ | 缺少 emergence + 显式 provenance + 多人协同写 proposal |

**3 个收敛点**——上面 5 个 G 实际上指向同一个理论判断：

1. **同质化是 LLM 自由产出的副作用**——降低同质化的最便宜方式不是更复杂的 prompting，而是**通过界面设计限制 LLM 的角色**。
2. **多元视角的保护需要前置而非后置的 provenance**——把"谁说的、什么时候、扩展自哪里"做成原子的 first-class 属性，而不是事后的 author tag。
3. **异步接力的 onboarding cost** 与 **同质化** 共享一个解：让长讨论被分解为可扫读的最小单元，同时保留追溯回原始上下文的双向链接。

这三个收敛点支撑了我们机制族的合理性，**且不依赖具体设计形态**——你可以选择"原子化 + 颜色"、可以选择"语义图 + author chip"、可以选择"卡片瀑布 + 来源徽章"，本质都在解决同一个问题。

---

## 4. 竞争分析

### 4.1 单用户 LLM 画布 / sensemaking 工具

| 系统 | 场景 | 核心机制 | 与我们的关键差距 |
|------|------|---------|----------------|
| [Sensecape (UIST 2023)](https://dl.acm.org/doi/10.1145/3586183.3606756) | 单用户复杂信息任务 | 多层级 abstract canvas + hierarchy view | 单用户；不处理多元视角；没有协作 |
| [Graphologue (UIST 2023)](https://arxiv.org/abs/2305.11483) | 把 LLM 线性聊天转图 | 关系图 GUI | 单用户；不处理 provenance |
| [Selenite (UIST 2024)](https://www.researchgate.net/publication/380521443) | online sensemaking | LLM-generated comprehensive overviews | 单用户；sensemaking 不是 ideation |
| [Luminate (CHI 2024)](https://dl.acm.org/doi/10.1145/3613904.3642400) | 创意写作 design space | LLM 生成结构化维度 | 单用户；没有协作 |
| [ABScribe (CHI 2024)](https://dl.acm.org/doi/10.1145/3613904.3641899) | AI co-writing variations | adjacent variation slots | 单用户；用于写作而非 ideation |
| [Memolet (UIST 2024)](https://dl.acm.org/doi/10.1145/3654777.3676388) | conversational memory reuse | 物化 memory 单元 | 单用户；不处理多人协作 |
| [Cocoa (CHI 2026)](https://dl.acm.org/doi/10.1145/3772318.3791673) | 研究 co-planning + co-execution | interactive plan, document editor | 单用户 + AI agent；不处理多人协作 |

**结论**：这一类工作非常多，做得也精致，但**全是单用户**。把它们当作我们多人异步系统的"原子级别交互词典"很有价值（很多交互细节我们可以借鉴），但它们都不是直接竞品。

### 4.2 群体协作 LLM ideation 工具

| 系统 | 场景 | 核心机制 | 与我们的关键差距 |
|------|------|---------|----------------|
| [AI-Augmented Brainwriting (CHI 2024)](https://dl.acm.org/doi/10.1145/3613904.3642414) | 同步小团队 brainwriting | LLM 评估 idea relevance/innovation/insightfulness | 同步、小团队、LLM 当评委（仍是同质化助推器） |
| [Collaborative Canvas (CHIWORK 2024)](https://dl.acm.org/doi/10.1145/3663384.3663398) | 同步 group ideation | 共享画布上的 sticky notes，人 + LLM 都能产出 | 同步；用户偏好预筛 LLM 输出（间接证明 LLM 当作者有问题）；无 provenance、无文献整合 |
| [CoQuest (CHI 2024)](https://dl.acm.org/doi/10.1145/3613904.3642698) | 单研究者 + AI agent 共创 RQ | 三面板：RQ flow / paper graph / AI thoughts | 单人 + AI；不处理多人接力；AI processing delay 反而成为 feature（与我们的"AI 仅作为连接器"思路同向但单人化） |
| [Idea-Catalyst (Sparking Scientific Creativity, ICLR 2025+)](https://arxiv.org/abs/2603.12226) | LLM 内部跨学科联想 | decompose-reformulate-synthesize 流水线 | 没有人类协作界面；纯 LLM 推理框架 |

**结论**：这是我们最近的"竞争邻居"。三大共同弱点：
1. **同步而非异步**：除 CoQuest 外都是同步小团队；CoQuest 是单人。
2. **LLM 充当原子作者**：Brainwriting 让 LLM 评分（依然影响走向），Canvas 让 LLM 直接生成 sticky note，CoQuest 让 LLM 主动提出 RQ。这与同质化文献给出的对策正相反。
3. **没有视角可见性 + 文献基石的同台共存**。

### 4.3 前 LLM 时代的众包 ideation 系统

| 系统 | 场景 | 核心机制 | 与我们的关键差距 |
|------|------|---------|----------------|
| [IdeaHound (UIST 2016)](https://dl.acm.org/doi/10.1145/2984511.2984578) | 大规模 crowd ideation | 用户自然空间排列 → t-SNE → semantic model | 无 LLM；无 provenance / 视角；无文献；无 proposal 生成 |
| [Crowdboard (Andolina)](https://www.semanticscholar.org/paper/Crowdboard%3A-Augmenting-In-Person-Idea-Generation-Andolina-Schneider/b0d2c39159c00b9cd981488180fadddab4a38895) | 现场+远程 crowd 增强 | 大屏 + 远程 micro-task | 同步；现场为主 |
| [Directed Diversity (CHI 2021)](https://dl.acm.org/doi/10.1145/3411764.3445782) | 单人 crowd ideator | embedding distance 推开 prompts | 单人尺度；不处理多人协作 |
| [Interpretable Directed Diversity (CHI 2022)](https://dl.acm.org/doi/10.1145/3491102.3517551) | 同上 + 可解释反馈 | 模型解释提升 ideation | 同上 |

**结论**：这一脉的精神（用语义距离/聚类对抗趋同）与我们一致；具体实现已被 LLM 时代超越。我们应该把 IdeaHound 的"涌现式 subtopic"作为机制血缘骄傲地写进 related work，并用"LLM 时代 + provenance + 视角"重述它。

### 4.4 讨论 / deliberation 平台

| 系统 | 场景 | 核心机制 | 与我们的关键差距 |
|------|------|---------|----------------|
| [Polis](https://compdemocracy.org/polis/) | 大规模意见聚合 | 短陈述 + agree/disagree 投票 + PCA/K-means 聚类参与者 | 处理 *opinion clustering* 不是 ideation；不产 proposal |
| Kialo | 结构化辩论 | 论证树 | 树状结构限制；不支持 ideation 的 emergent subtopic |
| [Wikum (CSCW 2017)](https://dl.acm.org/doi/10.1145/2998181.2998235) | 论坛长帖摘要 | recursive summarization | 摘要损失 provenance；不为 ideation 设计 |
| [CommunityClick (CSCW 2020)](https://groups.cs.umass.edu/hci-vis/wp-content/uploads/sites/33/2020/09/CommunityClick_CSCW2020_CR.pdf) | town hall 反馈 | 匿名 iClicker + LLM-friendly report 生成 | 场景窄；无 ideation emergent 结构 |

**结论**：deliberation 平台的核心思路（聚类 → 投票 → 涌现）与我们的 subtopic emergence 概念有重叠，但**它们处理的是 vote-on-statement，不是 build-on-idea**。我们可以借鉴它们的"用聚类辅助大规模视图"传统。

### 4.5 综合 mapping（一图总览）

```
                          单用户                    群体（同步）             群体（异步接力）
                          ────────                  ──────────────          ─────────────────
LLM 自由生成内容           Sensecape, Graphologue,   AI-Brainwriting,        ✗ 极少（且同质化文献
                          Selenite, Luminate,       Collaborative Canvas      显示这条路径有问题）
                          Memolet, Cocoa
                          
LLM 受约束 / 仅做连接整合   ✗ 少                     ✗ 几乎没有              ⭐ 我们的设计空间
                          
人类 + 文献 + AI 共存       ✗                        ✗                       ⭐ 我们的设计空间
+ provenance 一阶可见

视角/背景作为一阶变量       ✗                        ✗                       ⭐ 我们的设计空间
```

——三个 ⭐ 是我们的可行设计空间，且是**至今没有任何一个系统占据的交集**。这就是我们的研究 niche。

---

## 5. 研究问题与 Introduction 叙事骨架

### 5.1 一句话研究问题（候选三个版本，待与 Yun 选）

**版本 A（机制驱动 / 系统贡献）**：
> 在异步、跨学科、领域级别的研究社区 ideation 中，哪些**界面机制**能同时（i）降低新加入者的认知成本，（ii）抵抗 LLM 引入的群体级同质化，（iii）保留多元视角的可见性？

**版本 B（实证驱动 / 实证贡献）**：
> 当 LLM 在多人异步研究 ideation 中仅扮演 *连接器/整合者* 而非 *原子想法作者* 时，相比让 LLM 自由生成想法，群体输出的 idea 多样性、跨学科涌现与 newcomer onboarding 成本会有怎样的差异？

**版本 C（概念贡献 / 范式提出）**：
> 我们提出 *Background-Aware Atomic Ideation*——一种把人类视角、文献依据与受约束的 AI 整合作为视觉差异化、provenance 可追溯的最小单元的协作 ideation 范式——并通过原型与用户研究验证其在异步研究社区场景下的认知成本与多样性表现。

### 5.2 三个 RQ（适合放进 paper / SIG）

- **RQ1**：在长讨论中，把贡献分解为"最小单元 + 来源/视角可见 + 双向回链原始上下文"是否能显著降低新加入者的 sensemaking 成本，与 Wikum-style 摘要、原始线性帖、AI-Augmented Brainwriting baseline 相比？
- **RQ2**：在 LLM 介入的群体 ideation 中，把 AI 的角色约束为 *连接现有原子* 而非 *产生新原子*，是否能缓解 [Anderson et al. 2024] 实证的群体级同质化？多样性指标如何变化？
- **RQ3**：把 contributor background 作为视觉一阶变量（颜色编码 + 双轨推荐 With You / Stretch You）是否促进跨学科 sub-collaboration 的涌现？还是会触发同质聚集（identity anchoring）？

### 5.3 Introduction 叙事骨架

**段 1 — Hook**：研究 ideation 越来越分布式、异步、跨学科——CHI workshop 的延伸讨论、跨实验室的 proposal 共建、DeSci/DAO-style 研究社区。这种"社区级别 ideation"与传统的小团队 brainstorm 在规模、时间、参与者多样性上都有结构差异，因此需要新的工具范式。

**段 2 — 既有路径与其各自盲区**：
- 单用户 LLM sensemaking 工具（Sensecape、Graphologue、Selenite、Luminate、Memolet、Cocoa）做出了精致的"个人画布"，但缺乏多人共在的机制。
- 群体协作 LLM ideation（AI-Augmented Brainwriting、Collaborative Canvas、CoQuest）大多面向同步小团队，且让 LLM 自由产出 idea。
- 前 LLM 时代的众包 ideation（IdeaHound、Crowdboard、Directed Diversity）证明了"emerging semantic clustering"可行，但缺少 LLM 时代的多类内容共存。

**段 3 — 新出现的根本风险**：当我们把 LLM 直接搬进 ideation，最近一年的实证文献（Anderson et al. C&C 2024、Doshi & Hauser 2024、Padmakumar & He、PNAS Echoes in AI、Si et al. ICLR 2025/26）一致指向同一个失败模式：群体级同质化。LLM 的"贴心"恰恰在系统层面缩小了集体的可能性空间。Si et al. 的 *Ideation-Execution Gap* 进一步证明：表面更新颖的 LLM idea 在执行后表现更差。

**段 4 — 还有第二条 trouble**：异步接力下，新加入者面对长讨论会放弃；多元视角在合并中被稀释；LLM 引入虽降低表面入场成本，却同时把不同声音洗成一种语气（"AI 把所有人压成一个声音"）。Wikum-style 摘要解决了一半问题但牺牲了 provenance；author tag 是后置标签而非前置设计。

**段 5 — 我们的诊断**：这两条 trouble 共享一个根因——**贡献被收敛成无差别文本，而"谁、为什么、扩展自哪里"的元信号被擦除**。一旦元信号缺失，新加入者无法快速 navigate，LLM 无法在不损失多样性的前提下整合。

**段 6 — 我们的设计原则（机制族而非具体形态）**：
1. **最小贡献单元 + provenance**：让长内容被分解为可扫读、可定位、可双向回链的最小单元，每个单元自带"谁、何时、扩展自哪里"。
2. **多类内容差异化共存**：人类、文献、AI 三类内容**视觉上第一眼可辨**，让 LLM 输出不能混入人类语气。
3. **AI 受约束的连接者角色**：AI 的输出必须依附于至少一个其他原子（明示连接关系），不允许凭空产生新原子；这是对群体级同质化的*界面级*对策。
4. **涌现式聚类 + 未聚类区**：subtopic 不预定义，由相似度涌现；低聚类置信度的 contribution 进入"未聚类区"而非被算法埋没。
5. **视角作为一阶变量 + 双轨推荐**：contributor background 可视化（colored），但同时给"异质同伴推荐"作为反制 identity anchoring 的机制。

> **重要说明**：以上 5 条是 *机制族* 不是 *具体形态*。原子化是其中一种实现，但 G1-G5 同样可以用语义图、卡片瀑布、3D 空间等形态实现。本文锚定的是设计原则，具体形态与原型在 [System Design] 章节展开。

**段 7 — RQ 与贡献声明**：
- RQ1-3 如上。
- 贡献候选（与 Yun 商讨选 1-2）：
  - (A) **系统贡献**：第一个把"人类原子 + 文献原子 + AI 原子"作为视觉差异化、provenance 一阶变量的多人异步研究 ideation 系统。
  - (B) **实证贡献**：在 LLM 群体级同质化已被反复实证的当下，首次界面级地用"AI 仅作为连接器"约束并实证其对多样性的影响。
  - (C) **概念贡献**：提出 *Background-Aware Atomic Ideation* 作为人机协作 ideation 的新范式。

---

## 6. 设计灵活性边界与可行性论证

按你的要求，**机制描述刻意保留灵活性**。下面列举了哪些设计元素是"机制级别（不能动）"，哪些是"形态级别（可以动）"：

| 层级 | 不能动（机制原则） | 可以变（具体形态） |
|------|-----------------|-------------------|
| 内容 | 三类内容必须视觉差异化共存（G1） | 是否一定叫"原子"；是否一定是 sticky note 形状 |
| AI 角色 | AI 必须明示连接现有内容、不能凭空生成（G2） | 实现可以是"虚线边框"、可以是"必须 mention 至少一个 atom"、可以是"AI 输出渲染为现有 atoms 的 link list" |
| 视角 | contributor background 必须可见、可切换隐藏（G3） | 可以是颜色、可以是 chip、可以是 avatar halo、可以是 layer toggle |
| 异步接力 | 新加入者必须有低成本入场（G4） | 可以是 AI summary、可以是 changelog、可以是"自上次以来"高亮、可以是 onboarding flow |
| 涌现 | 聚类必须涌现、不能预定义；低置信度有 grace zone（G5） | 算法选择（embedding + threshold / GMM / DBSCAN…）、未聚类区的视觉位置 |

**可行性论证（为什么这是个真问题，不是工具炫技）**：

1. **真问题**：群体级同质化已经被多个独立实证证实（Anderson et al. C&C 2024、Doshi & Hauser 2024、PNAS Echoes in AI），且参数/prompt 调整无法解决。
2. **对策方向有理论根据**：把 AI 角色降级为整合者，与 [Liu et al. "Who Owns Creativity"] 的"empower scientists, not reduce them to operators" 同向；与 He et al. "Which Contributions Deserve Credit" 的 granular attribution 同向。
3. **机制族未被任何系统同时实现**：见 §3 与 §4.5 mapping，三个 ⭐ 区域是公开的设计空间。
4. **可执行性 / 评估可行**：用户研究有清楚的 baseline——AI-Augmented Brainwriting（同步小团队、LLM 评委）、Collaborative Canvas（同步、LLM 自由生成）、Wikum（异步但只有摘要）；多样性指标（Anderson et al. 提供的 group-level diversity score）、onboarding cost（time-to-first-contribution、sensemaking accuracy）、ownership（Liu et al. control level scale）都已有量表。
5. **scope 可控**：MVP 不需要解决所有 5 个 G，可以选 G1+G2+G4 作为 paper claim，G3+G5 作为 future work / discussion。

---

## 7. 待验证的开放问题与潜在风险

写在这里是为了 ahead-of-time 提示风险，避免后续被审稿人 / 导师质疑时措手不及：

**开放问题**：
1. "AI 仅作为连接器"是否真的足够约束？如果 AI 可以连接 N 个 atoms，它实际上仍能"通过 chain of links 间接产生新 idea"。需要 ablation：受约束 AI vs 自由 AI vs 无 AI。
2. 颜色编码可能触发 identity anchoring（设计师看到"这是工程师说的"会打折扣）——这是 [Risk 3] 在 Ideation 设计上下文文档里被提及的；需要消融研究证明 net positive。
3. 异步接力的"接力质量"如何度量？time-to-first-contribution 简单但不够；是否要引入"cross-contributor build-on rate"等关系指标？
4. 系统是否需要 facilitator 角色（人类版主）？还是完全自治？社区治理模型是 paper scope 还是 future work？
5. 跨学科涌现的因果归因——即使我们看到了跨学科合作发生，能否归因到我们的设计而不是参与者本身的多样性？需要随机化分配 + 控制 baseline。

**潜在风险**：
- **被竞品快速超越**：CoQuest、AI-Augmented Brainwriting 都来自活跃研究组，他们随时可能扩展到多人异步。**对策**：尽快把 G1-G5 的概念组合公开（哪怕 SIG 形式），声称概念占位。
- **同质化指标的可信度**：Anderson et al. 的 group-level diversity score 是 BERT embedding pairwise distance，可能不够 sensitive。**对策**：引入 multiple metrics（embedding distance + topic LDA distance + 人工编码）。
- **跨学科参与者招募难**：CHI 实验通常是 CS 学生主导。**对策**：与教育、社科、设计学院预先建立招募管道（5-15 SIG 之前可以做 pilot）。
- **scope creep**：5 个 G 都做会让 paper 太满。**对策**：选 G1+G2+G4 主打，G3+G5 写在 implications 中。

---

## 8. 行动清单（与 Yun 对齐前的准备）

1. **挑 RQ 与贡献**：从 §5.1 三个版本中选一个，从 §5.3 段 7 三个 contribution 候选中选 1-2 个。
2. **画 mapping table**：把 §4.5 的总览图打磨成 paper 里的 *Figure 1: positioning*。
3. **对接已有原型**：当前 Chrono-Test 中的 screen-domain.jsx / screen-subtopic.jsx 已经覆盖了 G1+G2+G4 的视觉雏形，但需要把 §6 的"机制级别 vs 形态级别"做成清晰的设计语言文档（不要让评审误以为我们的贡献是"原子化交互形态"）。
4. **决定 SIG vs Full Paper 的策略**：SIG（5/15 deadline）适合 (C) 概念贡献版本；full paper 走 (A)+(B) 系统+实证。
5. **预约一次 pilot**：找 3-5 个跨学科参与者（最好包含至少 1 个非 CS 背景）做 30 分钟原型试用，重点观察 onboarding 时长 + AI 原子产生时的反应。

---

## 附录 · 关键文献索引（按主线分组，便于撰写 related work）

### A. 众包科研 ideation 与 collective creativity
- IdeaHound (UIST 2016) — Siangliulue et al. https://dl.acm.org/doi/10.1145/2984511.2984578
- Self-sustainable Idea Generation — Siangliulue 2017. http://iis.seas.harvard.edu/papers/2017/siangliulue17supporting.shtml
- Crowdboard — Andolina et al. https://www.semanticscholar.org/paper/Crowdboard%3A-Augmenting-In-Person-Idea-Generation-Andolina-Schneider/b0d2c39159c00b9cd981488180fadddab4a38895
- Directed Diversity (CHI 2021) — Chung & Adar. https://dl.acm.org/doi/10.1145/3411764.3445782
- Interpretable Directed Diversity (CHI 2022) — Chung & Adar. https://dl.acm.org/doi/10.1145/3491102.3517551
- Wikum (CSCW 2017) — Zhang & Verou et al. https://dl.acm.org/doi/10.1145/2998181.2998235
- CommunityClick (CSCW 2020) — Jasim & Khaloo et al. https://groups.cs.umass.edu/hci-vis/wp-content/uploads/sites/33/2020/09/CommunityClick_CSCW2020_CR.pdf
- Crowd Research (UIST) — Vaish et al. https://www.cs.unc.edu/~gaikwad/assets/publications/crowd-research-uist.pdf
- A Review of LLM-Assisted Ideation (2025) — Li, Padilla et al. https://arxiv.org/abs/2503.00946

### B. LLM 同质化、锚定与 fixation
- Homogenization Effects of LLMs on Human Creative Ideation (C&C 2024) — Anderson, Shah, Kreminski. https://mkremins.github.io/publications/Homogenization_C&C2024.pdf
- Echoes in AI: Quantifying Lack of Plot Diversity in LLM Outputs (PNAS) — https://www.pnas.org/doi/10.1073/pnas.2504966122
- We're Different, We're the Same: Creative Homogeneity Across LLMs — https://arxiv.org/html/2501.19361v1
- Inspiration booster or creative fixation? (Nature HSSC 2025) — https://www.nature.com/articles/s41599-025-05867-9
- Understanding the Anchoring Effect of LLM (ICLR HCAIR 2026) — https://arxiv.org/pdf/2505.15392
- Can LLMs Generate Novel Research Ideas? — Si, Yang, Hashimoto. https://arxiv.org/abs/2409.04109
- The Ideation-Execution Gap (ICLR 2026) — Si et al. https://arxiv.org/abs/2506.20803
- Who Owns Creativity and Who Does the Work? Trade-offs in LLM-Supported Research Ideation — Houjiang Liu, Yujin Choi, Sanjana Gautam, Gabriel Jaffe, Soo Young Rieh, Matthew Lease (arXiv 2601.12152, Jan 2026). https://arxiv.org/abs/2601.12152
- Sparking Scientific Creativity via LLM-Driven Interdisciplinary Inspiration — Kargupta et al. https://arxiv.org/abs/2603.12226
- AnchoredAI — https://arxiv.org/abs/2509.16128

### C. 跨学科协作、boundary objects 与 provenance
- Distance Matters (HCI Journal 2000) — Olson & Olson. https://dl.acm.org/doi/10.1207/S15327051HCI1523_4
- Understanding the Role of Objects in Cross-Disciplinary Collaboration (Org. Science 2012) — Nicolini, Mengis, Swan. https://www.researchgate.net/publication/258438020
- Which Contributions Deserve Credit? (CHI 2025) — He, Houde et al. https://arxiv.org/abs/2502.18357
- The Provenance Problem: LLMs and the Breakdown of Citation Norms — https://arxiv.org/pdf/2509.13365
- Exploring Collaboration Patterns in Human-AI Co-creation (PACM HCI 2024) — https://dl.acm.org/doi/10.1145/3757594

### D. 群体协作 LLM ideation（直接竞品）
- AI-Augmented Brainwriting (CHI 2024) — Shaer et al. https://dl.acm.org/doi/10.1145/3613904.3642414
- Collaborative Canvas (CHIWORK 2024) — Gonzalez et al. https://dl.acm.org/doi/10.1145/3663384.3663398
- CoQuest: Research Question Co-Creation (CHI 2024) — Liu, Chen, Cheng et al. https://dl.acm.org/doi/10.1145/3613904.3642698
- Cocoa: Co-Planning and Co-Execution with AI Agents (CHI 2026) — Feng, Weld, Zhang. https://dl.acm.org/doi/10.1145/3772318.3791673

### E. 单用户 LLM sensemaking / canvas
- Sensecape (UIST 2023) — Suh et al. https://dl.acm.org/doi/10.1145/3586183.3606756
- Graphologue (UIST 2023) — https://arxiv.org/abs/2305.11483
- Selenite (UIST 2024) — https://www.researchgate.net/publication/380521443
- Luminate (CHI 2024) — https://dl.acm.org/doi/10.1145/3613904.3642400
- ABScribe (CHI 2024) — https://dl.acm.org/doi/10.1145/3613904.3641899
- Memolet (UIST 2024) — https://dl.acm.org/doi/10.1145/3654777.3676388

### F. Deliberation 平台
- Polis — https://compdemocracy.org/polis/
- Kialo — https://en.wikipedia.org/wiki/Kialo
- Opportunities and Risks of LLMs for Scalable Deliberation with Polis — https://arxiv.org/html/2306.11932

---

## 附录 · 一句话给导师的 elevator pitch

> "现有 LLM 协作 ideation 工具几乎都是单用户或同步小团队，且让 LLM 自由产出想法——而过去一年的实证证据（Anderson et al. C&C 2024 等）一致表明 LLM 在群体层面会**减少集体多样性**。我们提出一个机制族：把贡献分解为最小单元，把人类/文献/AI 三类来源做成视觉差异化的一阶变量，把 AI 限制为'连接器'而非'作者'，从而**用界面机制而非 prompt 工程**对抗同质化，同时降低跨学科异步社区中新加入者的认知成本。这一组合在已有 IdeaHound、Sensecape、AI-Augmented Brainwriting、CoQuest 等系统中没有任何一家同时占据。"
