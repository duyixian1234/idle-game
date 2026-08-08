/**
 * 全站线性 SVG 图标资产层（building-cards spec ticket 01）。
 *
 * 设计约束：
 * - 统一 24px viewBox、2px 描边、圆角协调的线性风格；颜色全部继承 `currentColor`
 *   （状态着色由 CSS 的 color 控制，无 JS 状态参与）。
 * - `<symbol>` sprite 一次性定义（dom.ts buildLayout 输出隐藏 sprite 容器），
 *   卡片用 `<use href="#ic-<id>">` 引用——250ms 全量重建只复制 use 节点，
 *   控制 DOM 体积与 GC 压力，不引入增量 diff。
 * - 完整性约束（测试锁死）：每个建筑/天体/派系 id 必须有对应 symbol、symbol id 无重复；
 *   未知 id 渲染时用兜底图标（ICON_FALLBACK）。
 */
export const ICON_FALLBACK = 'unknown'

/** 图标表：id → symbol 内部图形（g 内 path/circle/rect 等，统一 inherit 描边样式）。
 *  线稿概念见 spec Further Notes（grill Q12 用户逐项确认通过）。 */
export const ICONS: Record<string, string> = {
  // ---- 民用建筑 ----
  // 采矿机 = 钻头（菱形钻尖 + 横杆 + 斜撑）
  miner: `
    <path d="M12 4l3 5.2L12 20 9 9.2z"/>
    <path d="M7.5 9.2h9"/>
    <path d="M5 5.2l3.4 3.4M19 5.2l-3.4 3.4"/>`,
  // 太阳能板 = 光伏面板 + 顶部小太阳（光芒）
  solar: `
    <rect x="4" y="11" width="16" height="9" rx="1.5"/>
    <circle cx="12" cy="6.5" r="2"/>
    <path d="M12 1.5v2M6.5 6.5h2M17.5 6.5h2M8.3 3.2l1.4 1.4M15.7 3.2l-1.4 1.4M8.3 9.8l1.4-1.4M15.7 9.8l-1.4-1.4"/>`,
  // 实验室 = 烧瓶（圆底三角）+ 气泡
  lab: `
    <path d="M10 3h4v4.6l3 5.4a5 5 0 0 1-10 0l3-5.4z"/>
    <path d="M8.5 19.5h7"/>
    <circle cx="12" cy="16.8" r="1.1"/>`,
  // 精炼厂 = 高炉（矩形罐）+ 炉内火焰
  refinery: `
    <rect x="6" y="8" width="12" height="12" rx="2"/>
    <path d="M12 11c1.6 1.4 1.6 3 0 4.4S10.4 17.8 12 19.2"/>`,
  // 深层钻机 = 井架钻塔（A 形框架 + 钻杆）
  deepDrill: `
    <path d="M5 19V9l7-5.5L19 9v10"/>
    <path d="M5 13.5h14"/>
    <path d="M12 9.5V19"/>
    <path d="M9.5 19v-3h5v3"/>`,
  // ---- 军事建筑 ----
  // 兵营 = 头盔（盔顶半圆 + 帽檐 + 盔徽）
  barracks: `
    <path d="M5.5 13a6.5 6.5 0 0 1 13 0z"/>
    <path d="M4 13h16"/>
    <path d="M12 8.5v3"/>
    <path d="M10 11.5h4"/>`,
  // 军港 = 锚 + 轨道环
  militaryPort: `
    <circle cx="12" cy="4.5" r="2.3"/>
    <path d="M12 6.8v9.2"/>
    <path d="M5 19.5h14"/>
    <path d="M6.5 13a5.5 5.5 0 0 0 11 0z"/>`,
  // ---- 星系间工程 ----
  // 星港矿场 = 小行星 + 传送吊臂
  starportMine: `
    <ellipse cx="8" cy="11.5" rx="4.2" ry="3" transform="rotate(-15 8 11.5)"/>
    <path d="M11.5 9.8L17 4.5"/>
    <path d="M17 4.5v6"/>
    <path d="M17 10.5h-2.5"/>`,
  // 聚变恒星阵列 = 恒星 + 戴森环
  stellarArray: `
    <circle cx="12" cy="12" r="3.2"/>
    <ellipse cx="12" cy="12" rx="6.2" ry="2.3"/>
    <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>`,
  // 星海智库 = 打开的书 + 星芒
  thinkTank: `
    <path d="M5 4.5A6.5 6.5 0 0 1 12 5.2a6.5 6.5 0 0 1 7-.7V19a6.5 6.5 0 0 0-7-.8 6.5 6.5 0 0 0-7 .8z"/>
    <path d="M12 5.2v13"/>
    <path d="M12 9.5l.6 1.3 1.4.2-1 1 .2 1.4-1.2-.6-1.2.6.2-1.4-1-1 1.4-.2z"/>`,
  // 星环冶炼场 = 行星 + 熔炼环
  ringSmelter: `
    <circle cx="12" cy="12" r="4.5"/>
    <ellipse cx="12" cy="12" rx="8" ry="2.6" transform="rotate(-20 12 12)"/>`,
  // 跃迁枢纽 = 虫洞双环（横环 + 竖环）
  jumpgate: `
    <ellipse cx="12" cy="12" rx="6.5" ry="3"/>
    <ellipse cx="12" cy="12" rx="3" ry="6.5"/>`,
  // 船坞 = 拱形船坞门 + 舰影
  dock: `
    <path d="M5 8.5V19h14V8.5"/>
    <path d="M5 8.5a7 7 0 0 1 14 0"/>
    <path d="M8.5 13.5l3.5-2 3.5 2v2.5h-7z"/>`,
  // ---- 舰队 ----
  // 护卫舰 = 舰船侧影
  ship: `
    <path d="M4.5 15.5l3-7h9l3 7z"/>
    <path d="M10 8.5l-1.2 3.5h2.7z"/>
    <path d="M8 15.5h2v2.5H8z"/>`,
  // ---- 探索天体 ----
  // 碎星矿带 = 小行星群
  rubbleBelt: `
    <circle cx="7.5" cy="9.5" r="2.4"/>
    <circle cx="13.5" cy="14.5" r="2"/>
    <circle cx="17" cy="8" r="1.3"/>
    <path d="M12 5.5l1.5 1.5M5 15.5l2 1"/>`,
  // 氦闪气云 = 中心亮团 + 辐射波纹
  heliumNebula: `
    <circle cx="12" cy="12" r="3.4"/>
    <path d="M12 5v2.5M12 16.5V19M5 12h2.5M16.5 12H19"/>
    <path d="M7.5 7.5l1.8 1.8M14.7 14.7l1.8 1.8M16.5 7.5l-1.8 1.8M9.3 14.7l-1.8 1.8"/>`,
  // 深空裂谷 = 两条相对锯齿线夹出的峡谷
  riftChasm: `
    <path d="M5.5 3l2.8 4-2.8 4 2.8 4-2.8 4"/>
    <path d="M18.5 3l-2.8 4 2.8 4-2.8 4 2.8 4"/>`,
  // 星际物流港 = 拱形港 + 港面 + 吊装横梁
  logistics: `
    <path d="M4.5 19V8.5a7.5 7.5 0 0 1 15 0V19"/>
    <path d="M4.5 14h15"/>
    <path d="M12 14v-3"/>
    <path d="M9.5 11h5"/>`,
  // 殖民前哨 = A 形屋顶小屋 + 天线
  outpost: `
    <path d="M6 17V10l6-4.5L18 10v7"/>
    <path d="M6 17h12"/>
    <path d="M12 5.5V10"/>
    <path d="M12 10l3 2.5"/>`,
  // ---- 科技（tech-cards：卡片化配套图标）----
  // 行星钻探 = 钻头（钻杆 + 螺纹 + 尖端）
  drillCore: `
    <path d="M12 4.5v4.5"/>
    <path d="M8.5 9h7l-1.2 3h-4.6z"/>
    <path d="M12 12v3.5"/>
    <path d="M10.5 19.5h3M9 16.5l1.5 3M15 16.5l-1.5 3"/>`,
  // 量子计算核心 = 原子核 + 双电子轨道
  quantumCore: `
    <circle cx="12" cy="12" r="2.2"/>
    <ellipse cx="12" cy="12" rx="5.8" ry="2.4" transform="rotate(30 12 12)"/>
    <ellipse cx="12" cy="12" rx="5.8" ry="2.4" transform="rotate(-30 12 12)"/>`,
  // 聚变电池 = 电池体 + 聚变符号
  fusionBattery: `
    <path d="M7 9.5h10v9H7z"/>
    <path d="M10 9.5V7.5h4v2"/>
    <path d="M10 14.5l1.5-2 1 1.5 1.5-2.5"/>`,
  // 纳米制造 = 六边形晶格（三个互锁六边形）
  nanoFab: `
    <path d="M12 5l6.2 3.6v7.2L12 19.4l-6.2-3.6V8.6z"/>
    <path d="M12 9.2l3.1 1.8v3.6L12 16.4l-3.1-1.8v-3.6z"/>`,
  // 军械科技 = 十字准星（外环 + 内环 + 刻度）
  militaryTech: `
    <circle cx="12" cy="12" r="6.5"/>
    <circle cx="12" cy="12" r="1.8"/>
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>`,
  // ---- 攻占目标（conquest-cards：卡片化配套图标）----
  // 废弃船坞 = 塔吊 + 船体骨架
  shipyard: `
    <path d="M7 19V5h10"/>
    <path d="M7 19h10"/>
    <path d="M11 19V9.5h6"/>
    <path d="M8.5 9.5h4.5l2 2.5H8.5z"/>`,
  // 星际残骸带 = 破碎残片（三角 + 碎块）
  wreckage: `
    <path d="M6 8.5l5-3 5.5 2.5-1.5 5-4 3-5-3z"/>
    <path d="M6 8.5l4 3 5-2.5"/>
    <path d="M16.5 6l2-1.5M18 11l2.5-1"/>`,
  // 虫群母巢 = 蜂窝巢穴（外六边 + 内孔）
  nest: `
    <path d="M12 4l6.5 3.8v7.4L12 19l-6.5-3.8V7.8z"/>
    <path d="M12 9l3.2 1.9v3.7L12 16.5l-3.2-1.9v-3.7z"/>
    <circle cx="12" cy="12.2" r="1.1"/>`,
  // ---- 派系徽标（初始 4 + 探索 4）----
  // 铁卫同盟 = 盾牌 + 对勾
  ferro: `
    <path d="M12 3.5l6.5 2.8v5.2c0 4.2-2.8 7-6.5 8.5-3.7-1.5-6.5-4.3-6.5-8.5V6.3z"/>
    <path d="M9.2 12l2 2 3.6-3.8"/>`,
  // 圣光议会 = 火炬（火苗 + 柄）
  lumen: `
    <path d="M12 3.5c-1.8 2.3-2.7 3.8-2.7 5.7a2.7 2.7 0 0 0 5.4 0c0-1.9-.9-3.4-2.7-5.7z"/>
    <path d="M12 12v3.5"/>
    <path d="M9 18.5h6M9 21h6"/>`,
  // 天鹅贸易联盟 = 天平（立柱 + 横梁 + 双盘）
  cygnus: `
    <path d="M12 4v15.5"/>
    <path d="M5 8h14"/>
    <path d="M5 8v3a3 3 0 0 0 6 0V8"/>
    <path d="M13 8v3a3 3 0 0 0 6 0V8"/>`,
  // 沃克斯矿业集团 = 矿镐（十字镐 + 矿石块）
  vox: `
    <path d="M4.5 19.5L13.5 10.5"/>
    <path d="M10.5 7.5l6 6"/>
    <path d="M12.5 5.5l6 6"/>
    <path d="M17.5 4.5l2 2"/>`,
  // 灰潮共同体 = 上升的余烬烟缕
  ashCommune: `
    <path d="M6.5 19c0-2.6 1.8-4.4 1.8-6.6 0-1.6 1-2.6 2-3.4"/>
    <path d="M12.5 19c0-2 1-3 1-4.8 0-1.4 1-2.2 1.8-2.7"/>
    <circle cx="17.5" cy="8" r="1.1"/>`,
  // 星环修道会 = 圆环 + 倾斜环带
  ringOrder: `
    <circle cx="12" cy="13" r="3.6"/>
    <ellipse cx="12" cy="13" rx="6.6" ry="2" transform="rotate(-20 12 13)"/>`,
  // 黑曜协议 = 黑曜棱柱 + 中缝
  obsidianPact: `
    <path d="M12 3.5l4.2 4.2L12 20.5 7.8 7.7z"/>
    <path d="M12 7.7v9.5"/>`,
  // 节点智械 = 电路节点 + 四向连线
  nodeIntellect: `
    <circle cx="12" cy="12" r="2.6"/>
    <path d="M12 4.5v4.9M12 14.6v4.9M4.5 12h4.9M14.6 12h4.9"/>`,
  // ---- 一级导航（ui-redesign ticket 02：emoji → SVG；Q15 定案）----
  // 星域 = 星座星图（三点连线）
  'nav-sector': `
    <circle cx="7" cy="8" r="1.6"/>
    <circle cx="17" cy="6" r="1.2"/>
    <circle cx="14" cy="16" r="1.8"/>
    <path d="M8.3 9.3l5.3 5.4M9 7.4l6.8-1M13.6 14.8l2.2-6.9"/>`,
  // 档案 = 档案夹（翻盖 + 内页线）
  'nav-archive': `
    <path d="M4 6.5h6l2 2.5h8v9.5H4z"/>
    <path d="M8 12.5h8"/>`,
  // 探索 = 雷达信标（中心点 + 十字扫描）
  'nav-explore': `
    <circle cx="12" cy="12" r="2"/>
    <path d="M12 5v2.5M12 16.5V19M5 12h2.5M16.5 12H19"/>
    <path d="M7.8 7.8l1.5 1.5M14.7 14.7l1.5 1.5M16.2 7.8l-1.5 1.5M9.3 14.7l-1.5 1.5"/>`,
  // 设置 = 齿轮（8 齿 + 中心孔）
  'nav-settings': `
    <circle cx="12" cy="12" r="3"/>
    <path d="M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2"/>
    <path d="M7.2 7.2l1.5 1.5M15.3 15.3l1.5 1.5M16.8 7.2l-1.5 1.5M8.7 15.3l-1.5 1.5"/>`,
  // 派遣 = 火箭（机身 + 舷窗 + 尾焰）
  dispatch: `
    <path d="M12 3.5c1.8 2.2 2.6 4.2 2.6 6.2v3.3l-1.3 3h-2.6l-1.3-3V9.7c0-2 .8-4 2.6-6.2z"/>
    <circle cx="12" cy="9.5" r="1"/>
    <path d="M12 15.9v3.6M9.5 19.5h5"/>`,
  // ---- 成就图标（ach-cards：成就卡牌化配套图标）----
  // 结盟握手 = 双手相握（两腕 + 交叠手弧）
  handshake: `
    <path d="M5 15.5v3h5v-3"/>
    <path d="M14 15.5v3h5v-3"/>
    <path d="M4.5 15.5l4.3-4.3 2.4 2.4 2.4-2.4 4.3 4.3"/>
    <path d="M5.5 10.5c-.5-1.4.3-2.8 1.7-3.2 1-.3 2 .1 2.6.9M18.5 10.5c.5-1.4-.3-2.8-1.7-3.2-1-.3-2 .1-2.6.9"/>`,
  // 贸易金币 = 双曲交换箭头 + 币心
  trade: `
    <path d="M6.5 9a7 7 0 0 1 11-2.5"/>
    <path d="M17.5 15a7 7 0 0 1-11 2.5"/>
    <path d="M6.5 6.5v3h3M17.5 17.5v-3h-3"/>
    <circle cx="12" cy="12" r="2.6"/>`,
  // 联邦徽记 = 双环 + 中央星徽（官方印章式）
  'federation-seal': `
    <circle cx="12" cy="12" r="7"/>
    <circle cx="12" cy="12" r="4.6"/>
    <path d="M12 8.6l.8 1.7 1.9.3-1.4 1.3.3 1.9-1.6-.9-1.6.9.3-1.9-1.4-1.3 1.9-.3z"/>`,
  // 无限 = 双环十字（lemniscate）
  infinity: `
    <path d="M7 9.5a2.5 2.5 0 1 0 0 5c3.2 0 2.1-5 5-5s1.8 5 5 5a2.5 2.5 0 1 0 0-5"/>`,
  // 殖民行星 = 行星 + 小屋 + 旗帜
  colony: `
    <circle cx="12" cy="14" r="5"/>
    <path d="M9.5 13.2l2.5-2 2.5 2"/>
    <path d="M9.5 13.2v2h5v-2"/>
    <path d="M15 7.5V11"/>
    <path d="M15 7.5l2.8-.8v2.4L15 9.9"/>`,
  // 声望星光 = 凹角四芒星 + 小星芒
  favor: `
    <path d="M12 3.5c.8 4 1.9 5.7 5.5 6.5-3.6.8-4.7 2.5-5.5 6.5-.8-4-1.9-5.7-5.5-6.5 3.6-.8 4.7-2.5 5.5-6.5z"/>
    <path d="M17.8 15l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"/>`,
  // 时钟 = 表盘 + 指针
  clock: `
    <circle cx="12" cy="12" r="7"/>
    <path d="M12 7.5V12l3 2"/>`,
  // 勒索 = 爪握金币（三爪钩 + 金币）
  extort: `
    <circle cx="12" cy="15.5" r="3.5"/>
    <path d="M8 10.5c.5 1.5 1.2 2.7 2.5 3"/>
    <path d="M12 9.8c0 1.8-.3 3-.8 4.2"/>
    <path d="M16 10.5c-.5 1.5-1.2 2.7-2.5 3"/>
    <path d="M9.5 9.5c-.8 1.3-1.5 2.3-2 3.3"/>`,
  // 铁链 = 双环互锁（斜置椭圆链环）
  shackle: `
    <ellipse cx="9" cy="10" rx="5" ry="3.6" transform="rotate(-35 9 10)"/>
    <ellipse cx="15" cy="14" rx="5" ry="3.6" transform="rotate(-35 15 14)"/>`,
  // 橄榄枝 = 曲枝 + 双叶 + 橄榄
  olive: `
    <path d="M4.5 19.5c3-3.5 6.5-7.5 10.5-11.5"/>
    <path d="M10.5 13l3-1.5-1.5-3"/>
    <path d="M13.5 11l1.5-3"/>
    <ellipse cx="7" cy="16.5" rx="2.8" ry="3.8" transform="rotate(-35 7 16.5)"/>`,
  // 重生日 = 朝阳出海（旭日 + 地平线）
  reborn: `
    <path d="M12 4.5V7"/>
    <path d="M5.5 11H8M16 11h2.5"/>
    <path d="M7.8 8.8l1.8 1.8M14.4 8.8l-1.8 1.8"/>
    <path d="M4 15a8 8 0 0 1 16 0"/>
    <path d="M6 19h12"/>`,
  // 双轨星门 = 双环星门（并排双轨）
  'dual-gate': `
    <circle cx="8.5" cy="12" r="4.5"/>
    <circle cx="8.5" cy="12" r="1.6"/>
    <circle cx="15.5" cy="12" r="4.5"/>
    <circle cx="15.5" cy="12" r="1.6"/>`,
  // ---- 资源图标（log-filter-resource-icons：顶部资源条文字符号 → SVG，Q4/Q10 定案）----
  // 矿物 = 多面体晶体（菱形截面 + 内部折射线）
  'res-mineral': `
    <path d="M12 3.5l7 5v7l-7 5-7-5v-7z"/>
    <path d="M12 3.5v7M5 8.5l7 4M19 8.5l-7 4M12 15.5v5"/>`,
  // 能源 = 闪电（Z 形电弧 + 火花）
  'res-energy': `
    <path d="M13 3.5L6.5 13h4.2L10.4 20.5 17 10.5h-4.2z"/>
    <path d="M17.2 5.2l1.8-2M18.5 8.3l2-.7"/>`,
  // 科技 = 神经网络节点（中心圆 + 三向外连线 + 小节点）
  'res-tech': `
    <circle cx="12" cy="12" r="2.3"/>
    <path d="M12 9.7V3.8M13.9 13.4l5 2.9M10.1 13.4l-5 2.9"/>
    <circle cx="12" cy="3" r="1.2"/>
    <circle cx="19.5" cy="16.6" r="1.2"/>
    <circle cx="4.5" cy="16.6" r="1.2"/>`,
  // 军力 = 交叉剑盾（后方交叉双剑 + 前置盾徽）
  'res-military': `
    <path d="M6.5 6.5l11 11"/>
    <path d="M17.5 6.5l-11 11"/>
    <path d="M6.5 6.5l-1.8-1.8M17.5 6.5l1.8-1.8"/>
    <path d="M16.2 16.2l1.8 1.8M7.8 16.2l-1.8 1.8"/>
    <path d="M12 3.5l6.5 2.8v5.2c0 4.2-2.8 7-6.5 8.5-3.7-1.5-6.5-4.3-6.5-8.5V6.3z"/>`,
  // ---- 兜底 ----
  // 未知 = 圆角方块 + 问号
  unknown: `
    <rect x="4" y="4" width="16" height="16" rx="3"/>
    <path d="M10 9.5a2 2 0 1 1 3.6 1.3c-.9 1-1.6 1.5-1.6 2.7"/>
    <path d="M12 16.6v.1"/>`,
}

/** 生成 symbol id（use href 引用目标） */
export function iconSymbolId(id: string): string {
  return `ic-${id}`
}

/** 渲染隐藏 sprite 容器 HTML（一次性输出，卡片 use 引用） */
export function iconSpriteHtml(): string {
  const symbols = Object.entries(ICONS)
    .map(
      ([id, body]) =>
        `<symbol id="${iconSymbolId(id)}" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g></symbol>`,
    )
    .join('')
  return `<svg class="icon-sprite" xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`
}

/** 生成图标引用（未知 id 兜底到 unknown symbol） */
export function iconUse(id: string, cls = 'icon'): string {
  const sid = ICONS[id] ? id : ICON_FALLBACK
  return `<svg class="${cls}" aria-hidden="true"><use href="#${iconSymbolId(sid)}"></use></svg>`
}
