<template>
  <main class="workspace-page">
    <div class="workspace-shell">
      <header class="site-header">
        <RouterLink to="/" class="brand">
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
          <h1>连接工具，<em>让能力逐步长出来。</em></h1>
          <p class="intro-copy">这里是 MCP 能力的统一入口。每个功能都可以独立接入、独立演进，天气助手只是其中一个开始。</p>
        </div>

        <section class="tool-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">Available tools</p>
              <h2>已接入能力</h2>
            </div>
            <span class="tool-count">01 个工具</span>
          </div>

          <RouterLink to="/weather" class="tool-card">
            <div class="tool-icon">☼</div>
            <div class="tool-copy">
              <div class="tool-title-row">
                <h3>天气助手</h3>
                <span class="tool-status">已连接</span>
              </div>
              <p>查询天气预报、天气预警，以及结合城市出行场景给出建议。</p>
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
