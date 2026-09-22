<template>
  <main class="workspace-page">
    <div class="workspace-shell">
      <header class="site-header">
        <RouterLink to="/logs" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-copy">
            <span class="brand-name">MCP WORKSPACE</span>
            <span class="brand-caption">Web gateway</span>
          </span>
        </RouterLink>
        <a-tag color="green">服务就绪</a-tag>
      </header>

      <section class="workspace-content">
        <div class="workspace-intro">
          <p class="eyebrow">MCP web workspace</p>
          <h1>连接工具，让能力逐步长出来。</h1>
          <p class="intro-copy">这里是 MCP 能力的统一入口。每个功能都可以独立接入、独立演进。</p>
        </div>

        <section class="tool-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Available tools</p>
              <h2>已接入能力</h2>
            </div>
            <span class="tool-count">02 个工具</span>
          </div>

          <RouterLink to="/chat?mode=fengyunsanguo&service=knowledge" class="tool-card">
            <div class="tool-icon">⚔</div>
            <div class="tool-copy">
              <div class="tool-title-row">
                <h3>风云三国题库</h3>
                <span class="tool-status">已连接</span>
              </div>
              <p>知识问答与随机一题：快速查答案、随机出题并作答判题。</p>
            </div>
            <span class="tool-arrow" aria-hidden="true">→</span>
          </RouterLink>

          <RouterLink to="/chat?mode=sango-novel" class="tool-card">
            <div class="tool-icon">📖</div>
            <div class="tool-copy">
              <div class="tool-title-row">
                <h3>三国演义原著解读</h3>
                <span class="tool-status">已连接</span>
              </div>
              <p>基于原著原文解读情节人物，引用出处以卡片区呈现。</p>
            </div>
            <span class="tool-arrow" aria-hidden="true">→</span>
          </RouterLink>

          <div class="coming-card">
            <span class="coming-mark">+</span>
            <div>
              <h3>更多 MCP 工具</h3>
              <p>新的服务将在这里拥有自己的入口。</p>
            </div>
          </div>
        </section>
      </section>

      <footer class="site-footer"><span>MCP Web Workspace</span><span>·</span><span>stdio → client → web</span></footer>
    </div>
  </main>
</template>
