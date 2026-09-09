/* Day/night toggle: reuse Butterfly's built-in #darkmode logic.
   Icon shows the current mode (night = moon, day = sun); tooltip shows the action. */
;(() => {
  const buttons = ['darkmode-nav', 'darkmode']
    .map(id => document.getElementById(id))
    .filter(Boolean)
  if (!buttons.length) return

  const titleConfig = (window.GLOBAL_CONFIG && GLOBAL_CONFIG.darkmodeTitle) || {}
  const syncUI = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
    const iconClass = dark ? 'fa-moon' : 'fa-sun'
    const title = dark ? titleConfig.night : titleConfig.day
    buttons.forEach(btn => {
      const icon = btn.querySelector('i')
      if (icon) {
        const hasFixedWidth = icon.className.includes('fa-fw')
        icon.className = `fas ${hasFixedWidth ? 'fa-fw ' : ''}${iconClass}`
      }
      if (title) {
        btn.title = title
        btn.setAttribute('aria-label', title)
      }
    })
  }

  const navBtn = document.getElementById('darkmode-nav')
  if (navBtn) {
    navBtn.addEventListener('click', () => {
      const darkBtn = document.getElementById('darkmode')
      if (darkBtn) darkBtn.click()
    })
  }

  syncUI()
  if (window.MutationObserver) {
    new MutationObserver(syncUI).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
  }
})()

/* ==========================================================
   导航重构：首页双栏（精选/最新）区块局部分页、分类树/归档展开、卡片收缩
   ========================================================== */
;(() => {
  const PER_PAGE_KEY = 'blog_per_page'
  const PER_PAGE_KEY_FEATURED = 'blog_featured_per_page'
  const BASE_PER_PAGE = 20
  const HOME_PER_OPTIONS = [10, 20, 50]
  const LIST_PER_OPTIONS = [20, 50, 100]

  const sectionStates = new Map()
  const featuredSource = { items: null }

  const getState = section => {
    if (!sectionStates.has(section.id)) {
      sectionStates.set(section.id, {
        per: section.defaultPer,
        pageK: 1,
        total: null,
        lastBasePage: null,
        lastTotalPages: null,
        appliedKey: null
      })
    }
    return sectionStates.get(section.id)
  }

  /* ---- 区块发现 ---- */
  const getSections = () => {
    const sections = []

    if (document.querySelector('#recent-posts-featured .recent-post-items')) {
      sections.push({
        id: 'featured',
        containerSel: '#recent-posts-featured .recent-post-items',
        itemSelector: '.recent-post-item',
        perParam: 'fper',
        pageParam: 'fp',
        perKey: PER_PAGE_KEY_FEATURED,
        options: HOME_PER_OPTIONS,
        defaultPer: 10,
        domBased: true
      })
    }

    if (document.querySelector('#recent-posts-latest .recent-post-items')) {
      sections.push({
        id: 'latest',
        containerSel: '#recent-posts-latest .recent-post-items',
        itemSelector: '.recent-post-item',
        perParam: 'per',
        pageParam: 'p',
        perKey: PER_PAGE_KEY,
        options: HOME_PER_OPTIONS,
        defaultPer: 10,
        domBased: false
      })
    }

    if (document.querySelector('#archive .article-sort, #category .article-sort, #tag .article-sort')) {
      sections.push({
        id: 'list',
        containerSel: '#archive .article-sort, #category .article-sort, #tag .article-sort',
        itemSelector: '.article-sort-item',
        perParam: 'per',
        pageParam: 'p',
        perKey: PER_PAGE_KEY,
        options: LIST_PER_OPTIONS,
        defaultPer: 20,
        domBased: false
      })
    }

    return sections
  }

  const getNav = section => document.querySelector(`nav[data-section="${section.id}"]`)
  const getSelect = section => document.querySelector(`select.per-page-select[data-section="${section.id}"]`)

  /* ---- URL / 基础页 ---- */
  const getCollectionRoot = () => {
    const base = location.pathname.replace(/\/page\/\d+\/$/, '')
    return base.endsWith('/') ? base : base + '/'
  }

  const buildBaseUrl = pageNumber => {
    const root = getCollectionRoot()
    return pageNumber <= 1 ? root : `${root}page/${pageNumber}/`
  }

  const fetchBasePageDoc = async pageNumber => {
    const response = await fetch(buildBaseUrl(pageNumber))
    const html = await response.text()
    return new DOMParser().parseFromString(html, 'text/html')
  }

  const getLastBasePage = section => {
    const st = getState(section)
    if (st.lastBasePage !== null) return st.lastBasePage
    let last = 1
    const nav = getNav(section)
    if (nav) {
      nav.querySelectorAll('.pagination a').forEach(link => {
        const href = link.getAttribute('href') || ''
        const match = href.match(/\/page\/(\d+)\//)
        if (match) last = Math.max(last, parseInt(match[1], 10))
      })
    }
    st.lastBasePage = last
    return last
  }

  /* ---- 参数 / 总数 ---- */
  const readSectionParams = section => {
    const usp = new URLSearchParams(location.search)
    const per = parseInt(usp.get(section.perParam), 10)
    const p = parseInt(usp.get(section.pageParam), 10)
    const saved = parseInt(localStorage.getItem(section.perKey), 10)
    const effectivePer = section.options.includes(per)
      ? per
      : (section.options.includes(saved) ? saved : section.defaultPer)
    const hasParam = section.options.includes(per)
    const pageK = hasParam && Number.isFinite(p) && p > 0 ? p : 1
    return { effectivePer, pageK, hasParam }
  }

  const getHomeMeta = () => {
    const meta = document.querySelector('.home-list-meta')
    if (!meta) return { total: 0, featured: 0 }
    return {
      total: parseInt(meta.getAttribute('data-total-posts'), 10) || 0,
      featured: parseInt(meta.getAttribute('data-featured-count'), 10) || 0
    }
  }

  const getSourceItems = section => {
    if (!featuredSource.items) {
      const container = document.querySelector(section.containerSel)
      featuredSource.items = container
        ? Array.from(container.children).filter(el => el.matches(section.itemSelector))
        : []
    }
    return featuredSource.items
  }

  const getLatestTotal = () => {
    const meta = getHomeMeta()
    return Math.max(0, meta.total - meta.featured)
  }

  const getListTotal = async section => {
    const st = getState(section)
    if (st.total !== null) return st.total
    const container = document.querySelector(section.containerSel)
    const lastPage = getLastBasePage(section)
    let count = 0
    if (lastPage > 1) {
      const doc = await fetchBasePageDoc(lastPage)
      const fetched = doc.querySelector(section.containerSel)
      if (fetched) {
        count = Array.from(fetched.children)
          .filter(el => el.matches(section.itemSelector) && !el.classList.contains('year'))
          .length
      }
    } else if (container) {
      count = Array.from(container.children)
        .filter(el => el.matches(section.itemSelector) && !el.classList.contains('year'))
        .length
    }
    st.total = (lastPage - 1) * BASE_PER_PAGE + count
    return st.total
  }

  /* ---- URL 序列化 ---- */
  const buildViewUrl = (section, per, pageK) => {
    const root = getCollectionRoot()
    if (section.id === 'list' && per === section.defaultPer) {
      return pageK <= 1 ? root : `${root}page/${pageK}/`
    }
    return `${root}?${section.perParam}=${per}&${section.pageParam}=${pageK}`
  }

  const serializeUrl = (changed, per, pageK) => {
    const root = getCollectionRoot()
    const sections = getSections()
    if (sections.length === 1 && sections[0].id === 'list') {
      return buildViewUrl(sections[0], per, pageK)
    }
    const usp = new URLSearchParams()
    sections.forEach(section => {
      const st = getState(section)
      const sPer = section.id === changed.id ? per : st.per
      const sPage = section.id === changed.id ? pageK : st.pageK
      if (sPer !== section.defaultPer || sPage !== 1) {
        usp.set(section.perParam, String(sPer))
        usp.set(section.pageParam, String(sPage))
      }
    })
    const qs = usp.toString()
    return qs ? `${root}?${qs}` : root
  }

  /* ---- 渲染 ---- */
  const renderPagination = (section, totalPages, currentK, per) => {
    const nav = getNav(section)
    const pag = nav && nav.querySelector('.pagination')
    if (!pag) return
    const url = page => serializeUrl(section, per, page)
    let html = ''

    if (currentK > 1) {
      html += `<a class="extend prev" rel="prev" href="${url(currentK - 1)}" data-page="${currentK - 1}"><i class="fas fa-chevron-left fa-fw"></i></a>`
    }

    let start = Math.max(1, currentK - 2)
    let end = Math.min(totalPages, start + 4)
    if (end - start < 4) start = Math.max(1, end - 4)

    for (let i = start; i <= end; i++) {
      html += i === currentK
        ? `<span class="page-number current">${i}</span>`
        : `<a class="page-number" href="${url(i)}" data-page="${i}">${i}</a>`
    }

    if (end < totalPages) {
      html += `<span class="space">&hellip;</span><a class="page-number" href="${url(totalPages)}" data-page="${totalPages}">${totalPages}</a>`
    }

    if (currentK < totalPages) {
      html += `<a class="extend next" rel="next" href="${url(currentK + 1)}" data-page="${currentK + 1}"><i class="fas fa-chevron-right fa-fw"></i></a>`
    }

    pag.innerHTML = html
  }

  const setSectionState = (section, per, pageK, totalPages) => {
    const st = getState(section)
    st.per = per
    st.pageK = pageK
    st.lastTotalPages = totalPages
  }

  const rebuildFeatured = (section, per, pageK) => {
    const container = document.querySelector(section.containerSel)
    const select = getSelect(section)
    if (!container || !select) return

    const items = getSourceItems(section)
    const total = items.length
    const totalPages = Math.max(1, Math.ceil(total / per))
    pageK = Math.min(Math.max(1, pageK), totalPages)

    const frag = document.createDocumentFragment()
    items.slice((pageK - 1) * per, pageK * per).forEach(el => frag.appendChild(el.cloneNode(true)))

    container.innerHTML = ''
    container.appendChild(frag)
    renderPagination(section, totalPages, pageK, per)
    select.value = String(per)
    setSectionState(section, per, pageK, totalPages)
  }

  const rebuildFetched = async (section, per, pageK) => {
    const container = document.querySelector(section.containerSel)
    const select = getSelect(section)
    if (!container || !select) return

    const total = section.id === 'latest' ? getLatestTotal() : await getListTotal(section)
    const totalPages = Math.max(1, Math.ceil(total / per))
    pageK = Math.min(Math.max(1, pageK), totalPages)

    const startGlobal = (pageK - 1) * per + 1
    const endGlobal = Math.min(pageK * per, total)
    const frag = document.createDocumentFragment()
    const lastBase = getLastBasePage(section)
    let done = false

    if (section.id === 'latest' && getHomeMeta().featured === 0) {
      // 无精选：基础页序号即最新区序号，可精确起止
      const firstBase = Math.floor((startGlobal - 1) / BASE_PER_PAGE) + 1
      const lastBaseNeeded = Math.ceil(endGlobal / BASE_PER_PAGE)
      let globalIndex = (firstBase - 1) * BASE_PER_PAGE
      for (let bp = firstBase; bp <= Math.min(lastBaseNeeded, lastBase) && !done; bp++) {
        const doc = await fetchBasePageDoc(bp)
        const c = doc.querySelector(section.containerSel)
        if (!c) continue
        for (const el of Array.from(c.children)) {
          if (!el.matches(section.itemSelector)) continue
          globalIndex++
          if (globalIndex < startGlobal) continue
          if (globalIndex > endGlobal) {
            done = true
            break
          }
          frag.appendChild(el.cloneNode(true))
        }
      }
    } else {
      // 逐页累计（最新区服务端已过滤精选；归档/分类/标签为普通列表）
      let cumulative = 0
      let lastYearText = null
      for (let bp = 1; bp <= lastBase && !done; bp++) {
        const doc = await fetchBasePageDoc(bp)
        const c = doc.querySelector(section.containerSel)
        if (!c) continue
        let currentYear = null
        let yearText = null
        for (const el of Array.from(c.children)) {
          if (el.classList.contains('year')) {
            currentYear = el
            yearText = el.textContent.trim()
            continue
          }
          if (!el.matches(section.itemSelector)) continue
          cumulative++
          if (cumulative < startGlobal) continue
          if (cumulative > endGlobal) {
            done = true
            break
          }
          if (yearText && yearText !== lastYearText) {
            frag.appendChild(currentYear.cloneNode(true))
            lastYearText = yearText
          }
          frag.appendChild(el.cloneNode(true))
        }
      }
    }

    container.innerHTML = ''
    container.appendChild(frag)
    renderPagination(section, totalPages, pageK, per)
    select.value = String(per)
    setSectionState(section, per, pageK, totalPages)
  }

  const rebuild = async (section, per, pageK) => {
    if (section.domBased) rebuildFeatured(section, per, pageK)
    else await rebuildFetched(section, per, pageK)
  }

  const applyChange = async (section, per, pageK) => {
    await rebuild(section, per, pageK)
    history.pushState(null, '', serializeUrl(section, per, pageK))
  }

  /* ---- 初始化 ---- */
  let stateApplying = false
  const applyUrlState = async () => {
    if (stateApplying) return
    stateApplying = true
    try {
      const sections = getSections()
      for (const section of sections) {
        const { effectivePer, pageK, hasParam } = readSectionParams(section)
        const st = getState(section)
        const key = `${effectivePer}:${pageK}`
        if (st.appliedKey === key) continue

        const homeSection = section.id === 'featured' || section.id === 'latest'
        if (!homeSection && !hasParam && effectivePer === section.defaultPer) continue

        await rebuild(section, effectivePer, pageK)
        st.appliedKey = key
        if (!hasParam) {
          history.replaceState(null, '', serializeUrl(section, effectivePer, pageK))
        }
      }
    } finally {
      stateApplying = false
    }
  }

  const initPerPageSelector = () => {
    document.querySelectorAll('select.per-page-select').forEach(select => {
      if (select.dataset.bound === '1') return
      select.dataset.bound = '1'
      select.addEventListener('change', () => {
        const section = getSections().find(s => s.id === select.dataset.section)
        if (!section) return
        const value = parseInt(select.value, 10)
        if (!section.options.includes(value)) return
        const st = getState(section)
        localStorage.setItem(section.perKey, String(value))
        const currentGlobalStart = (st.pageK - 1) * st.per + 1
        const pageK = Math.max(1, Math.ceil(currentGlobalStart / value))
        applyChange(section, value, pageK)
      })
    })
  }

  /* ---- 分类树 / 归档展开、卡片收缩、区块局部分页 ---- */
  const bindTreeNavigation = () => {
    if (document.__treeNavBound) return
    document.__treeNavBound = true

    document.addEventListener('click', event => {
      const collapseBtn = event.target.closest('.card-collapse-btn')
      if (collapseBtn) {
        const card = collapseBtn.closest('.card-widget')
        if (card) card.classList.toggle('collapsed')
        return
      }

      const row = event.target.closest(
        '#aside-cat-list a.card-category-list-link, #drawer-cat-list a.card-category-list-link, #aside-archive-list a.card-archive-list-link'
      )
      if (row) {
        // 右侧“打开分类/归档页”图标：正常跳转
        if (event.target.closest('.tree-open')) return
        // 有子节点的行：点击整行只做展开/收起，不进入页面
        const item = row.parentElement
        if (item && item.classList.contains('parent')) {
          event.preventDefault()
          row.classList.toggle('expand')
        }
        return
      }

      // 区块局部分页：点页码只重建对应区块，不整页刷新
      const pageLink = event.target.closest('nav[data-section] .pagination a')
      if (pageLink) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const nav = pageLink.closest('nav[data-section]')
        const section = getSections().find(s => s.id === nav.dataset.section)
        if (!section) return
        const target = parseInt(pageLink.dataset.page, 10)
        let page
        if (Number.isFinite(target)) {
          page = target
        } else {
          const href = pageLink.getAttribute('href') || ''
          const match = href.match(/\/page\/(\d+)\//) || href.match(new RegExp(`[?&]${section.pageParam}=(\\d+)`))
          if (!match) return
          page = parseInt(match[1], 10)
        }
        event.preventDefault()
        const st = getState(section)
        // 上界由 rebuild 内部按实际总数钳制，这里只保证最小为 1
        applyChange(section, st.per, Math.max(1, page))
      }
    }, true)
  }

  const resetState = () => {
    sectionStates.clear()
    // pjax 换页后 DOM 已替换，缓存的上页节点会渲染出陈旧文章
    featuredSource.items = null
  }

  const init = () => {
    bindTreeNavigation()
    initPerPageSelector()
    applyUrlState()
  }

  document.addEventListener('DOMContentLoaded', init)
  document.addEventListener('pjax:complete', () => {
    resetState()
    init()
  })
  window.addEventListener('popstate', () => {
    resetState()
    applyUrlState()
  })
  if (document.readyState === 'interactive' || document.readyState === 'complete') init()
})()

/* ==========================================================
   布局切换：单栏 / 双栏 / 左导航 / VSCode
   ========================================================== */
;(() => {
  const LAYOUT_KEY = 'blog_layout_mode'
  const LAYOUT_MODES = ['left', 'immersive', 'right']

  const getMode = () => {
    let mode = localStorage.getItem(LAYOUT_KEY)
    if (!LAYOUT_MODES.includes(mode)) {
      // 兼容旧版模式与“隐藏侧栏”偏好
      const legacyMap = { double: 'left', single: 'immersive', left: 'right', vscode: 'right' }
      mode = legacyMap[mode] || (localStorage.getItem('aside-status') === 'hide' ? 'immersive' : 'left')
    }
    return mode
  }

  const applyMode = mode => {
    const html = document.documentElement
    html.classList.remove('layout-immersive', 'layout-right')
    if (mode === 'immersive' || mode === 'right') html.classList.add('layout-' + mode)
    document.querySelectorAll('.layout-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.layout === mode)
    })
  }

  const initLayoutSwitcher = () => {
    const btn = document.getElementById('layout-btn')
    const pop = document.getElementById('layout-switcher')
    if (!btn || !pop || btn.dataset.bound === '1') return
    btn.dataset.bound = '1'

    btn.addEventListener('click', event => {
      event.stopPropagation()
      pop.classList.toggle('open')
    })
    pop.addEventListener('click', event => {
      const opt = event.target.closest('.layout-option')
      if (!opt) return
      const mode = opt.dataset.layout
      localStorage.setItem(LAYOUT_KEY, mode)
      applyMode(mode)
      pop.classList.remove('open')
      window.dispatchEvent(new CustomEvent('layoutmodechange'))
    })
    document.addEventListener('click', () => pop.classList.remove('open'))
  }

  const init = () => {
    applyMode(getMode())
    initLayoutSwitcher()
  }

  document.addEventListener('DOMContentLoaded', init)
  if (document.readyState === 'interactive' || document.readyState === 'complete') init()
})()

/* ==========================================================
   抽屉：文件树 + 文章目录（VS Code 风格常驻，位置随布局模式互换）
   ========================================================== */
;(() => {
  const init = () => {
    if (document.__drawerBound) return

    const defs = []
    const treeBtn = document.getElementById('tree-drawer-btn')
    const treeDrawer = document.getElementById('tree-drawer')
    const treeMask = document.getElementById('tree-drawer-mask')
    const treeClose = document.getElementById('tree-drawer-close')
    if (treeBtn && treeDrawer && treeMask) {
      defs.push({
        key: 'blog_tree_drawer',
        btn: treeBtn,
        drawer: treeDrawer,
        mask: treeMask,
        closeBtn: treeClose,
        bodyClass: 'tree-drawer-docked'
      })
    }
    const tocBtn = document.getElementById('toc-drawer-btn')
    const tocDrawer = document.getElementById('toc-drawer')
    const tocMask = document.getElementById('toc-drawer-mask')
    const tocClose = document.getElementById('toc-drawer-close')
    if (tocBtn && tocDrawer && tocMask) {
      defs.push({
        key: 'blog_toc_drawer',
        btn: tocBtn,
        drawer: tocDrawer,
        mask: tocMask,
        closeBtn: tocClose,
        bodyClass: 'toc-drawer-docked'
      })
    }
    if (!defs.length) return
    document.__drawerBound = true

    const isDesktop = () => window.matchMedia('(min-width: 900px)').matches
    const isImmersive = () => document.documentElement.classList.contains('layout-immersive')
    const isPostPage = () => !!document.querySelector('#body-wrap.post')
    // 抽屉开合状态按页面类别分 key 存储：文章阅读页（post）与首页等其他页面（page）互不影响
    const storageKey = d => `${d.key}:${isPostPage() ? 'post' : 'page'}`

    const applyState = (d, open) => {
      d.drawer.classList.toggle('open', open)
      d.mask.classList.toggle('open', open)
      // 桌面端抽屉占布局空间（VS Code 风格），移动端为浮层
      document.body.classList.toggle(d.bodyClass, open)
    }

    const readState = d => {
      const saved = localStorage.getItem(storageKey(d))
      if (saved === 'open') return true
      if (saved === 'closed') return false
      // 默认：文章页两抽屉桌面常驻（沉浸模式默认收起），移动端收起；
      // 非文章页文件树默认收起（浮层按需打开，不占正文空间）
      return isDesktop() && !isImmersive() && (d.key !== 'blog_tree_drawer' || isPostPage())
    }

    // 顶栏抽屉按钮与抽屉同侧：左对齐树在左/目录在右；右对齐目录在左/树在右。
    // 按钮随布局模式互换位置（左槽=导航首位，右槽=#menus 内搜索按钮之后）
    const syncDrawerButtons = () => {
      const nav = document.getElementById('nav')
      const menus = document.getElementById('menus')
      const treeBtn = document.getElementById('tree-drawer-btn')
      const tocBtn = document.getElementById('toc-drawer-btn')
      if (!nav || !treeBtn) return
      const toLeftSlot = btn => nav.prepend(btn)
      const toRightSlot = btn => {
        if (!menus) return
        const anchor = menus.querySelector('#search-button')
        menus.insertBefore(btn, anchor ? anchor.nextSibling : menus.firstChild)
      }
      if (document.documentElement.classList.contains('layout-right')) {
        toRightSlot(treeBtn)
        if (tocBtn) toLeftSlot(tocBtn)
      } else {
        toLeftSlot(treeBtn)
        if (tocBtn) toRightSlot(tocBtn)
      }
    }

    // 目录抽屉：作者等卡片随页面滚动上滑消失，目录钉在抽屉顶部
    const tocTopEl = document.getElementById('toc-drawer-top')
    const tocMainEl = document.getElementById('toc-drawer-main')
    const updateTocScroll = () => {
      if (!isDesktop() || !tocDrawer || !tocDrawer.classList.contains('open') || !tocTopEl || !tocMainEl) return
      const layout = document.querySelector('#content-inner.layout')
      if (!layout) return
      const contentTop0 = layout.getBoundingClientRect().top + window.scrollY
      const topH = tocTopEl.offsetHeight
      const away = Math.max(0, Math.min(topH, window.scrollY - contentTop0))
      const t = `translateY(${-away}px)`
      tocTopEl.style.transform = t
      tocMainEl.style.transform = t
    }

    // 桌面端抽屉顶部与内容区顶部对齐（滚动时跟随，夹在固定导航下方）
    const syncDockTop = () => {
      if (!isDesktop()) return
      const layout = document.querySelector('#content-inner.layout')
      if (!layout) return
      const docTop = layout.getBoundingClientRect().top + window.scrollY
      // 内容顶部过低（如首页全屏横幅）时夹在视口下半区，保证抽屉可见
      const maxTop = Math.max(70, window.innerHeight - 340)
      // 不再为导航预留 70px：导航浮现在抽屉之上（z-index 覆盖），抽屉跟随内容到顶即可
      const top = Math.max(0, Math.min(docTop - window.scrollY, maxTop))
      defs.forEach(d => {
        if (d.drawer.classList.contains('open')) {
          d.drawer.style.top = top + 'px'
          d.drawer.style.height = `calc(100vh - ${top}px)`
        }
      })
      updateTocScroll()
    }

    // 沉浸 / 阅读模式：两个抽屉自动隐藏（不写 localStorage，退出后恢复原状态）
    const isFocusMode = () =>
      document.documentElement.classList.contains('layout-immersive') ||
      document.body.classList.contains('read-mode')

    const syncFocusMode = () => {
      defs.forEach(d => {
        if (isFocusMode()) {
          applyState(d, false)
        } else {
          const saved = localStorage.getItem(storageKey(d))
          applyState(d, saved ? saved === 'open' : readState(d))
        }
      })
      syncDockTop()
    }

    const open = d => {
      applyState(d, true)
      localStorage.setItem(storageKey(d), 'open')
      syncDockTop()
    }

    const close = d => {
      if (!d.drawer.classList.contains('open')) return
      applyState(d, false)
      localStorage.setItem(storageKey(d), 'closed')
    }

    const toggle = d => (d.drawer.classList.contains('open') ? close(d) : open(d))

    defs.forEach(d => {
      d.btn.addEventListener('click', () => toggle(d))
      d.mask.addEventListener('click', () => close(d))
      if (d.closeBtn) d.closeBtn.addEventListener('click', () => close(d))
      applyState(d, readState(d))
    })
    syncDrawerButtons()

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') defs.forEach(d => close(d))
    })
    syncDockTop()

    // 滚动时保持与内容顶部对齐
    let ticking = false
    window.addEventListener('scroll', () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        syncDockTop()
        updateTocScroll()
        ticking = false
      })
    }, { passive: true })
    // 首屏图片加载完成后重新对齐（横幅高度可能变化）
    window.addEventListener('load', syncDockTop)
    // 封面图懒加载等会改变横幅高度，观察页头尺寸变化时重新对齐
    const pageHeader = document.getElementById('page-header')
    if (pageHeader && window.ResizeObserver) {
      new ResizeObserver(syncDockTop).observe(pageHeader)
    }
    ;[300, 1000, 2000].forEach(delay => setTimeout(syncDockTop, delay))
    // 布局模式切换（含沉浸模式）：按钮随模式换位；进入隐藏两抽屉，退出恢复
    window.addEventListener('layoutmodechange', () => {
      syncDrawerButtons()
      syncFocusMode()
    })
    // 主题阅读模式通过 body.read-mode 类切换，观察变化同步抽屉
    let bodyWasReadMode = document.body.classList.contains('read-mode')
    if (window.MutationObserver) {
      const bodyObserver = new MutationObserver(() => {
        const isRead = document.body.classList.contains('read-mode')
        if (isRead === bodyWasReadMode) return
        bodyWasReadMode = isRead
        syncFocusMode()
      })
      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    }
    // 跨断点与移动端回退
    window.addEventListener('resize', () => {
      if (isDesktop()) {
        syncDockTop()
      } else {
        defs.forEach(d => {
          d.drawer.style.top = ''
          d.drawer.style.height = ''
        })
        if (tocTopEl) tocTopEl.style.transform = ''
        if (tocMainEl) tocMainEl.style.transform = ''
      }
      defs.forEach(d => {
        if (!isFocusMode() && !localStorage.getItem(storageKey(d))) applyState(d, readState(d))
      })
    })
  }

  document.addEventListener('DOMContentLoaded', init)
  if (document.readyState === 'interactive' || document.readyState === 'complete') init()
})()
