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

  function shortDate(value) {
    if (!value) return "时间未知"
    const text = String(value)
    return text.length >= 16 ? text.slice(5, 16) : text
  }

  function rangeText(range) {
    if (!range?.from || !range?.to) return "暂无时间范围"
    const from = String(range.from).slice(0, 10)
    const to = String(range.to).slice(0, 10)
    return from === to ? from : `${from} 至 ${to}`
  }

  function statusBadge(status) {
    if (!status) return undefined
    return element("span", `status-badge status-${status.tone}`, status.label)
  }

  function headerMetric(label, value, note) {
    const item = element("div", "header-metric")
    add(
      item,
      element("span", "header-metric-label", label),
      element("strong", "header-metric-value", value),
      element("span", "header-metric-note", note),
    )
    return item
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
      element("span", "identity-chip", `更新 ${shortDate(view.latestRecordAt)}`),
      view.pagination?.total > 1
        ? element("span", "identity-chip", `第 ${view.pagination.page} / ${view.pagination.total} 页`)
        : undefined,
    )
    copy.append(identity)

    const metrics = element("section", "header-metrics")
    add(
      metrics,
      headerMetric("总记录", view.summary.total, "本地保存"),
      headerMetric(view.game === "zzz" ? "S 级" : "五星", view.summary.highCount, "高稀有"),
      headerMetric(
        "平均出货",
        view.summary.averageHighPity === undefined ? "--" : view.summary.averageHighPity,
        view.summary.averageHighPity === undefined ? "等待样本" : "抽",
      ),
      headerMetric("UP / 歪", `${view.summary.upCount}/${view.summary.offCount}`, "限定角色池"),
    )

    const luck = element("aside", `luck-card luck-${view.luck.tone}`)
    const highLabel = view.game === "zzz" ? "S 级" : "五星"
    const luckMessage = view.summary.averageHighPity === undefined
      ? `暂无${highLabel}样本`
      : `${view.summary.highCount} 个${view.game === "zzz" ? " S 级" : "五星"}结果，平均 ${view.summary.averageHighPity} 抽`
    add(
      luck,
      element("span", "luck-kicker", "总体评价"),
      element("strong", "luck-label", view.luck.label),
      element("p", "luck-message", luckMessage),
    )
    add(header, copy, metrics, luck)
    return header
  }

  function poolMetric(label, value) {
    const item = element("div", "pool-metric")
    add(
      item,
      element("span", "pool-metric-label", label),
      element("strong", "pool-metric-value", value),
    )
    return item
  }

  function resolvedAsset(view, item) {
    const fallbackUrl = view.assets?.fallbackUrl ?? ""
    const catalogAsset = item.asset?.key
      ? view.assets?.catalog?.[item.asset.key]
      : undefined
    const url = catalogAsset?.url ?? item.asset?.url ?? fallbackUrl
    const declaredSource = item.asset?.source ?? catalogAsset?.source
    const source = !url || (fallbackUrl && url === fallbackUrl)
      ? "builtin"
      : declaredSource ?? "builtin"
    return { url, source }
  }

  function resultImage(view, item) {
    const media = element("div", `result-media result-media-${item.itemKind ?? "unknown"}`)
    const image = element("img", "result-image")
    const fallback = view.assets?.fallbackUrl
    const asset = resolvedAsset(view, item)
    image.src = asset.url
    image.alt = `${item.name}图片`
    image.loading = "eager"
    image.decoding = "sync"
    image.dataset.fallbackTried = !asset.url || asset.url === fallback ? "true" : "false"
    image.onerror = () => {
      if (fallback && image.dataset.fallbackTried !== "true") {
        image.dataset.fallbackTried = "true"
        image.src = fallback
        return
      }
      image.remove?.()
    }
    media.append(image)
    const badge = statusBadge(item.status)
    if (badge) media.append(badge)
    return media
  }

  function renderResult(view, item) {
    const card = element(
      "article",
      `result-card pull-${item.pullLuck.tone} result-kind-${item.itemKind ?? "unknown"}`,
    )
    const count = element("div", "result-count-band")
    if (item.pullPrefix) count.append(element("span", "pull-prefix", item.pullPrefix))
    add(
      count,
      element("strong", "pull-number", item.pulls),
      element("span", "pull-unit", "抽"),
      element("span", "pull-label", item.pullLuck.label),
    )
    add(
      card,
      resultImage(view, item),
      count,
      element("strong", "result-name", item.name),
      element("time", "result-time", shortDate(item.time)),
    )
    return card
  }

  function renderPool(view, pool) {
    const panel = element("article", "pool-panel")
    const heading = element("header", "pool-heading")
    const headingCopy = element("div", "pool-heading-copy")
    add(
      headingCopy,
      element("h2", "pool-name", pool.name),
      element("span", "pool-range", rangeText(pool.dateRange)),
      view.pagination?.total > 1
        ? element(
          "span",
          "pool-page-count",
          `本页 ${pool.items.length} / 全池 ${pool.highCount} 个${view.game === "zzz" ? " S 级" : "五星"}结果`,
        )
        : undefined,
    )
    const total = element("div", "pool-total")
    add(total, element("strong", "pool-total-value", pool.total), element("span", "pool-total-label", "抽"))
    add(heading, headingCopy, total)

    const stats = element("div", "pool-summary-grid")
    const isDeparture = pool.pityMode === "finite" || pool.pityMode === "consumed"
    if (isDeparture) {
      add(
        stats,
        poolMetric("五星", pool.highCount),
        poolMetric("首金", pool.guaranteePulls === undefined ? "--" : `第 ${pool.guaranteePulls} 抽`),
        poolMetric("额外金", pool.extraHighCount),
        poolMetric("总进度", `${pool.total} / ${pool.pityCap}`),
      )
    } else {
      add(
        stats,
        poolMetric("出货", pool.highCount),
        poolMetric("平均", pool.averageHighPity === undefined ? "--" : `${pool.averageHighPity} 抽`),
        poolMetric("最欧", pool.bestHighPity === undefined ? "--" : `${pool.bestHighPity} 抽`),
        poolMetric("最非", pool.worstHighPity === undefined ? "--" : `${pool.worstHighPity} 抽`),
      )
    }

    const pity = element("div", "pity-row")
    const pityCopy = element("div", "pity-copy")
    if (pool.pityMode === "consumed") {
      add(
        pityCopy,
        element("strong", "pity-current", "始发保底 已完成"),
        element("span", "pity-cap", `首金第 ${pool.guaranteePulls} 抽`),
      )
    } else if (pool.pityMode === "finite") {
      add(
        pityCopy,
        element("strong", "pity-current", `始发进度 ${pool.currentPity}`),
        element("span", "pity-cap", `/ ${pool.pityCap}`),
      )
    } else {
      add(
        pityCopy,
        element("strong", "pity-current", `当前垫抽 ${pool.currentPity}`),
        element("span", "pity-cap", `/ ${pool.pityCap}`),
      )
    }
    let upOff
    if (pool.pityMode === "consumed") {
      upOff = element(
        "span",
        "pool-upoff",
        pool.extraHighCount ? `另有 ${pool.extraHighCount} 个额外五星` : "一次性保底已消耗",
      )
    } else if (pool.pityMode === "finite") {
      upOff = element("span", "pool-upoff", "一次性首金保底")
    } else {
      upOff = pool.upCount || pool.offCount
        ? element("span", "pool-upoff", `UP ${pool.upCount} · 歪 ${pool.offCount}`)
        : element("span", "pool-upoff", `共 ${pool.highCount} 个${view.game === "zzz" ? " S 级" : "五星"}结果`)
    }
    add(pity, pityCopy, upOff)
    const track = element("div", "pity-track")
    const fill = element("div", "pity-fill")
    fill.style.width = `${Math.max(0, Math.min(100, Number(pool.pityPercent) || 0))}%`
    track.append(fill)

    const results = element("div", "pool-results")
    if (pool.items.length === 0) {
      const rarity = view.game === "zzz" ? "S 级" : "五星"
      const message = `暂无${rarity}结果；当前垫抽 ${pool.currentPity ?? 0} / ${pool.pityCap}。`
      results.append(element("div", "pool-empty", message))
    } else {
      for (const item of pool.items) results.append(renderResult(view, item))
    }

    add(panel, heading, stats, pity)
    if (pool.pityMode !== "consumed") panel.append(track)
    panel.append(results)
    return panel
  }

  function renderPoolBoard(view) {
    const section = element("section", "record-section")
    const heading = element("div", "section-heading")
    const rarity = view.game === "zzz" ? " S 级" : "五星"
    const sectionNote = view.pagination?.total > 1
      ? `第 ${view.pagination.page} / ${view.pagination.total} 页 · 共 ${view.pagination.totalItems} 个${rarity}结果`
      : `展示全部${rarity}结果`
    add(
      heading,
      element("div", "section-heading-copy", view.game === "zzz" ? "频段明细" : "卡池明细"),
      element("span", "section-note", sectionNote),
    )
    section.append(heading)

    const active = view.pools.filter(pool => pool.total > 0)
    const empty = view.pools.filter(pool => pool.total === 0)
    const board = element("div", "pool-board")
    const columns = [element("div", "pool-column"), element("div", "pool-column")]
    for (const [index, pool] of active.entries()) {
      columns[index % columns.length].append(renderPool(view, pool))
    }
    if (active.length > 0) board.append(...columns)
    if (active.length === 0) board.append(element("div", "empty-state", "当前角色没有可展示的抽卡记录。"))
    section.append(board)

    if (empty.length) {
      section.append(
        element("p", "empty-pool-summary", `暂无记录：${empty.map(pool => pool.name).join("、")}`),
      )
    }
    return section
  }

  function renderFooter(view) {
    const footer = element("footer", "record-footer")
    const displayedItems = view.pools.flatMap(pool => pool.items)
    const sources = displayedItems.map(item => resolvedAsset(view, item).source)
    const localSources = [...new Set(sources.filter(source => (
      source === "miao-plugin" || source === "ZZZ-Plugin"
    )))]
    const localLabel = localSources.join(" 与 ")
    const fallbackCount = sources.filter(source => !localSources.includes(source)).length
    let credit
    if (displayedItems.length === 0) {
      credit = "当前无高稀有图片可展示；缺失图片将使用本插件内置图像"
    } else if (localSources.length === 0) {
      credit = "高稀有图片均使用本插件内置图像"
    } else if (fallbackCount === 0) {
      credit = `高稀有图片均读取自本机 ${localLabel}`
    } else {
      credit = `部分高稀有图片读取自本机 ${localLabel}；其余使用本插件内置图像`
    }
    add(
      footer,
      element("p", "disclaimer", view.disclaimer),
      element("span", "brand", "xinghan-gacha-plugin"),
      element("span", "asset-credit", credit),
      element("time", "generated-at", `生成于 ${view.generatedAt.replace("T", " ").slice(0, 19)} UTC`),
    )
    return footer
  }

  try {
    const view = JSON.parse(dataNode.textContent)
    add(container, renderHeader(view), renderPoolBoard(view), renderFooter(view))
    document.body.dataset.rendered = "true"
  } catch (error) {
    container.append(element("div", "render-error", `记录页渲染失败：${error.message}`))
    document.body.dataset.rendered = "false"
  }
})()
