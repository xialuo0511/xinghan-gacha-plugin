(() => {
  "use strict"

  const dataNode = document.getElementById("record-data")
  const container = document.getElementById("container")

  function element(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined && text !== null) node.textContent = String(text)
    return node
  }

  function add(parent, ...children) {
    for (const child of children) if (child) parent.append(child)
    return parent
  }

  function metric(label, value, note) {
    const card = element("div", "metric-card")
    add(card, element("span", "metric-label", label), element("strong", "metric-value", value))
    if (note) card.append(element("span", "metric-note", note))
    return card
  }

  function statusBadge(status) {
    if (!status) return undefined
    return element("span", `status-badge status-${status.tone}`, status.label)
  }

  function sectionTitle(title, note) {
    const row = element("div", "section-heading")
    add(row, element("h2", "section-title", title), element("span", "section-note", note))
    return row
  }

  function renderHeader(view) {
    const header = element("header", "record-header")
    const copy = element("div", "header-copy")
    add(
      copy,
      element("div", "eyebrow", view.theme.eyebrow),
      element("h1", "record-title", view.theme.title),
      element("p", "record-subtitle", view.theme.subtitle),
    )
    const identity = element("div", "identity-strip")
    add(
      identity,
      element("span", "identity-chip", `UID ${view.uid}`),
      element("span", "identity-chip", view.region),
      element("span", "identity-chip", `最近记录 ${view.latestRecordAt ?? "--"}`),
    )
    copy.append(identity)

    const luck = element("aside", `luck-card luck-${view.luck.tone}`)
    add(
      luck,
      element("span", "luck-kicker", "欧非雷达"),
      element("strong", "luck-label", view.luck.label),
      element("p", "luck-message", view.luck.message),
    )
    add(header, element("div", "theme-emblem", "✦"), copy, luck)
    return header
  }

  function renderMetrics(view) {
    const average = view.summary.averageHighPity ?? "--"
    const upOff = `${view.summary.upCount} / ${view.summary.offCount}`
    const grid = element("section", "metric-grid")
    add(
      grid,
      metric("总记录", view.summary.total, "本地已保存"),
      metric(view.game === "zzz" ? "S 级出货" : "五星出货", view.summary.highCount, "仅统计金卡"),
      metric("平均出货", average === "--" ? average : `${average} 抽`, "仅按记录内区间"),
      metric("UP / 歪", upOff, view.summary.unknownUpCount ? `${view.summary.unknownUpCount} 条待确认` : "限定角色池"),
    )
    return grid
  }

  function renderPools(view) {
    const section = element("section", "record-section")
    add(section, sectionTitle("卡池概览", "当前垫抽按已保存记录计算"))
    const grid = element("div", "pool-grid")
    for (const pool of view.pools) {
      const card = element("article", "pool-card")
      const heading = element("div", "pool-heading")
      add(heading, element("h3", "pool-name", pool.name), element("span", "pool-total", `${pool.total} 条`))
      const values = element("div", "pool-values")
      add(
        values,
        element("span", "pool-pity", `当前 ${pool.currentPity} 抽`),
        element("span", "pool-high", `出货 ${pool.highCount}`),
      )
      if (pool.upCount || pool.offCount) {
        values.append(element("span", "pool-upoff", `UP ${pool.upCount} · 歪 ${pool.offCount}`))
      }
      const track = element("div", "pity-track")
      const fill = element("div", "pity-fill")
      fill.style.width = `${Math.max(0, Math.min(100, Number(pool.pityPercent) || 0))}%`
      track.append(fill)
      add(card, heading, values, track)
      card.append(element("div", "pool-footer", pool.latestHigh ? `最近高稀有：${pool.latestHigh}` : "暂无高稀有记录"))
      grid.append(card)
    }
    section.append(grid)
    return section
  }

  function renderHighlights(view) {
    const section = element("section", "record-section")
    const title = view.game === "zzz" ? "S 级出货" : "金卡出货"
    add(section, sectionTitle(title, `最近 ${view.highlights.length} / ${view.summary.highCount} 个`))
    const grid = element("div", "highlight-grid")
    if (view.highlights.length === 0) {
      grid.append(element("div", "empty-state", "尚无高稀有记录，下一发也许就是惊喜。"))
    }
    for (const item of view.highlights) {
      const card = element("article", `highlight-card pull-${item.pullLuck.tone}`)
      const top = element("div", "highlight-top")
      add(top, element("span", "pull-label", item.pullLuck.label), statusBadge(item.status))
      const score = element("div", "pull-score")
      add(score, element("strong", "pull-number", item.pulls), element("span", "pull-unit", "抽"))
      add(
        card,
        top,
        score,
        element("strong", "highlight-name", item.name),
        element("span", "highlight-pool", item.poolName),
        element("time", "highlight-time", item.time),
      )
      grid.append(card)
    }
    section.append(grid)
    return section
  }

  function renderFooter(view) {
    const footer = element("footer", "record-footer")
    add(
      footer,
      element("p", "disclaimer", view.disclaimer),
      element("span", "brand", "xinghan-gacha-plugin"),
      element("time", "generated-at", `生成于 ${view.generatedAt.replace("T", " ").slice(0, 19)} UTC`),
    )
    return footer
  }

  try {
    const view = JSON.parse(dataNode.textContent)
    add(
      container,
      renderHeader(view),
      renderMetrics(view),
      renderPools(view),
      renderHighlights(view),
      renderFooter(view),
    )
    document.body.dataset.rendered = "true"
  } catch (error) {
    container.append(element("div", "render-error", `记录页渲染失败：${error.message}`))
    document.body.dataset.rendered = "false"
  }
})()
