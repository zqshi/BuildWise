import { useState, useEffect } from "react";
import "../../styles/marketing.css";
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
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="marketing-page">
      <div className="marketing-backdrop" aria-hidden="true">
        <span className="marketing-glow marketing-glow-one" />
        <span className="marketing-glow marketing-glow-two" />
        <span className="marketing-glow marketing-glow-three" />
      </div>

      <header className={`marketing-nav${scrolled ? " marketing-nav-scrolled" : ""}`}>
        <div className="marketing-nav-inner">
          <a className="marketing-brand" href="#/" aria-label="BuildWise 官网">
            <span className="marketing-brand-logo" aria-hidden="true">
              BW
            </span>
            <span className="marketing-brand-copy">
              <strong>BuildWise</strong>
              <small>AI-Native Delivery</small>
            </span>
          </a>
          <div className="marketing-nav-actions">
            <button type="button" className="btn primary" onClick={onSecondaryAction}>
              {isAuthenticated ? "返回工作区" : "登录"}
            </button>
          </div>
        </div>
      </header>

      <div className="marketing-shell">

        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <p className="marketing-hero-badge">AI 原生软件交付工作台</p>
            <h1>
              业务人员直接推进
              <span>软件交付</span>
            </h1>
            <p className="marketing-hero-body">
              上传需求文档，AI 自动完成分析、生成交付物、评估发布风险。全程对话式引导，不需要写代码，不需要等排期。
            </p>
            <div className="marketing-hero-signal" aria-label="BuildWise 核心链路">
              <span>上传文档</span>
              <span>AI 分析</span>
              <span>确认发布</span>
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
                <span>Input</span>
                <strong>需求文档</strong>
                <small>PRD、原型、截图</small>
              </div>
              <div className="marketing-hero-stage-float marketing-hero-stage-float-right">
                <span>Output</span>
                <strong>交付物 + 发布决策</strong>
                <small>代码、测试、评审</small>
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
            <p>现在的痛</p>
            <h2>为什么你的团队总在重复解释同一件事</h2>
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
            <p>BuildWise 怎么解</p>
            <h2>上传文档，AI 帮你从分析做到发布</h2>
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
            <h2>不写代码也能推进软件交付</h2>
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
            <p>怎么用</p>
            <h2>三步完成一次迭代交付</h2>
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
            <h2>让业务人员直接参与软件交付，而不只是等结果</h2>
          </div>
        </section>

        <footer className="marketing-footer">
          <div className="marketing-footer-brand">
            <strong>BuildWise</strong>
            <span>AI-Native Delivery</span>
          </div>
          <div className="marketing-footer-meta">
            <span>© 2026 BuildWise. AI-native delivery platform for modern teams.</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
