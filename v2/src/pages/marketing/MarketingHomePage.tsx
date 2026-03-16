import {
  marketingHeroStats,
  marketingFeatures,
  marketingJourney,
  marketingProblems,
  marketingSolutions
} from "./marketingContent";

type MarketingHomePageProps = {
  isAuthenticated: boolean;
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
};

export function MarketingHomePage({
  isAuthenticated,
  onSecondaryAction
}: MarketingHomePageProps) {
  return (
    <main className="marketing-page">
      <div className="marketing-backdrop" aria-hidden="true">
        <span className="marketing-glow marketing-glow-one" />
        <span className="marketing-glow marketing-glow-two" />
        <span className="marketing-glow marketing-glow-three" />
      </div>

      <div className="marketing-shell">
        <header className="marketing-nav">
          <a className="marketing-brand" href="#/" aria-label="BuildWise 官网">
            <span className="marketing-brand-logo" aria-hidden="true">
              BW
            </span>
            <span className="marketing-brand-copy">
              <strong>BuildWise</strong>
              <small>Business Intent Compiler</small>
            </span>
          </a>
          <div className="marketing-nav-actions">
            <button type="button" className="btn primary" onClick={onSecondaryAction}>
              {isAuthenticated ? "返回工作区" : "登录"}
            </button>
          </div>
        </header>

        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <p className="marketing-hero-badge">业务意图编译器 · 企业级软件交付系统</p>
            <h1>
              将业务意图编译为
              <span>可运行软件</span>
            </h1>
            <p className="marketing-hero-body">
              BuildWise 用统一项目模型连接需求表达、软件生成与交付治理，让业务、设计与研发工作在同一条可追溯链路上协同。
            </p>
            <div className="marketing-hero-signal" aria-label="BuildWise 核心链路">
              <span>业务表达</span>
              <span>项目模型</span>
              <span>交付治理</span>
            </div>
          </div>
          <div className="marketing-hero-visual" aria-hidden="true">
            <div className="marketing-hero-stage">
              <div className="marketing-hero-stage-halo marketing-hero-stage-halo-one" />
              <div className="marketing-hero-stage-halo marketing-hero-stage-halo-two" />
              <div className="marketing-hero-stage-board">
                <div className="marketing-hero-stage-board-head">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="marketing-hero-stage-board-body">
                  <div className="marketing-hero-stage-sidebar">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="marketing-hero-stage-canvas">
                    <div className="marketing-hero-stage-ribbon" />
                    <div className="marketing-hero-stage-line marketing-hero-stage-line-wide" />
                    <div className="marketing-hero-stage-line marketing-hero-stage-line-mid" />
                    <div className="marketing-hero-stage-cluster">
                      <b className="marketing-hero-stage-tile marketing-hero-stage-tile-focus" />
                      <b className="marketing-hero-stage-tile" />
                      <b className="marketing-hero-stage-tile" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="marketing-hero-stage-float marketing-hero-stage-float-left">
                <span>Intent</span>
                <strong>Business context</strong>
                <small>目标、流程、约束</small>
              </div>
              <div className="marketing-hero-stage-float marketing-hero-stage-float-right">
                <span>Delivery</span>
                <strong>Project model</strong>
                <small>页面、接口、规则、治理</small>
              </div>
            </div>
          </div>
          <div className="marketing-hero-bottom">
            <div className="marketing-hero-actions">
              <button type="button" className="btn ghost" onClick={() => window.location.assign("#features")}>
                查看核心能力
              </button>
            </div>
            <div className="marketing-stat-row" aria-label="BuildWise 关键指标">
              {marketingHeroStats.map((item) => (
                <article className="marketing-stat-card" key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-contrast" id="contrast">
          <article className="marketing-problem-column">
            <p>传统困境</p>
            <h2>为什么现有软件交付链路总在失真</h2>
            <ul>
              {marketingProblems.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="marketing-solution-column">
            <p>BuildWise 解法</p>
            <h2>把需求表达、生成和治理纳入同一系统</h2>
            <ul>
              {marketingSolutions.map((item) => (
                <li key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        <section className="marketing-section" id="features">
          <div className="marketing-section-head">
            <p>核心能力</p>
            <h2>围绕统一项目模型建立软件交付语言</h2>
          </div>
          <div className="marketing-feature-grid">
            {marketingFeatures.map((item) => (
              <article className="marketing-feature-item" key={item.title}>
                <div className="marketing-feature-icon" aria-hidden="true">
                  {item.icon}
                </div>
                <strong>{item.title}</strong>
                <span>{item.summary}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-section marketing-journey" id="journey">
          <div className="marketing-section-head">
            <p>交付路径</p>
            <h2>从业务意图到软件交付的三步路径</h2>
          </div>
          <div className="marketing-journey-list">
            {marketingJourney.map((step) => (
              <article className="marketing-journey-row" key={step.index}>
                <div className="marketing-journey-visual">
                  <span>{step.index}</span>
                  <small>{step.title}</small>
                </div>
                <div className="marketing-journey-copy">
                  <strong>{step.title}</strong>
                  <p>{step.subtitle}</p>
                  <span>{step.summary}</span>
                  <ul className="marketing-journey-detail-list">
                    {step.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-cta">
          <div className="marketing-cta-copy">
            <p>BuildWise</p>
            <h2>让软件交付回到同一语义、同一模型、同一链路</h2>
          </div>
          <div className="marketing-cta-actions">
            <button type="button" className="btn primary" onClick={onSecondaryAction}>
              {isAuthenticated ? "返回工作区" : "登录"}
            </button>
          </div>
        </section>

        <footer className="marketing-footer">
          <div className="marketing-footer-brand">
            <strong>BuildWise</strong>
            <span>Business Intent Compiler</span>
          </div>
          <div className="marketing-footer-meta">
            <span>© 2026 BuildWise. Unified delivery model for modern software teams.</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
