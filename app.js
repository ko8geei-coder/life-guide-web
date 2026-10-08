/* ==========================================================================
   高性价比人生指南 · 移动端网页版
   单页应用：hash 路由 + 轻量索引首屏 + 分章按需加载
   数据全部本地，无需后端；收藏/进度存 localStorage
   ========================================================================== */
(function () {
  'use strict';

  // ---------- 常量 ----------
  var DATA = 'data/';
  var LS_FAV = 'lifeguide_fav_web';
  var LS_HIS = 'lifeguide_his_web';
  var LS_PROF = 'lifeguide_profile_web';

  // 标签字典（与 build-web.js 的 tagsKeys 顺序一致：钱/时间/毅力/收益/口径）
  var TAG_KEYS = ['钱', '时间', '毅力', '收益', '口径'];

  // ---------- 全局状态 ----------
  var IDX = null;             // index.json
  var chapterCache = {};     // slug -> 分章详情
  var viewSeq = 0;           // 视图令牌，防止快速切换时旧请求覆盖新视图

  // ---------- 工具 ----------
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function load(key, def) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {}
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast._tm);
    toast._tm = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }
  function fetchJSON(path) {
    return fetch(DATA + path + '?_=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function getChapter(idx) {
    var c = IDX.chapters[idx];
    if (chapterCache[c.slug]) return Promise.resolve(chapterCache[c.slug]);
    return fetchJSON(c.slug + '.json').then(function (d) {
      chapterCache[c.slug] = d;
      return d;
    });
  }
  // 把标签数组渲染成 chip
  function tagChips(tg, score) {
    var h = '';
    if (score != null) h += '<span class="chip g">性价比 ' + score + '</span>';
    if (tg && tg[0]) h += '<span class="chip">花费 ' + esc(tg[0]) + '</span>';
    if (tg && tg[1]) h += '<span class="chip">耗时 ' + esc(tg[1]) + '</span>';
    if (tg && tg[2]) h += '<span class="chip">毅力 ' + esc(tg[2]) + '</span>';
    return h;
  }

  // ---------- 收藏 / 历史 ----------
  function getFav() { return load(LS_FAV, {}); }
  function isFav(id) { return !!getFav()[id]; }
  function toggleFav(id) {
    var f = getFav();
    if (f[id]) { delete f[id]; save(LS_FAV, f); return false; }
    f[id] = Date.now(); save(LS_FAV, f); return true;
  }
  function getHis() { return load(LS_HIS, {}); }
  function touchHis(id, data) {
    var h = getHis();
    var old = h[id] || {};
    h[id] = { t: Date.now(), c: data.chIdx, e: data.ei, n: data.title, ch: data.chTitle };
    h[id].f = old.f || 0;
    save(LS_HIS, h);
  }
  function markRead(id) {
    var h = getHis();
    if (h[id]) { h[id].f = 1; save(LS_HIS, h); }
  }

  // ---------- 顶栏 ----------
  function topbar(title, opts) {
    opts = opts || {};
    var b = '<div class="topbar">';
    if (opts.back) b += '<a class="tb-back" href="#/">‹</a>';
    else b += '<div class="tb-back" style="visibility:hidden">‹</div>';
    b += '<div class="tb-title">' + esc(title) + '</div>';
    b += opts.action || '<div class="tb-act" style="visibility:hidden">　</div>';
    b += '</div>';
    return b;
  }

  // ---------- 底部导航 ----------
  var TABS = [
    { href: '#/', icon: '☰', text: '指南' },
    { href: '#/fav', icon: '♥', text: '收藏' },
    { href: '#/mine', icon: '☺', text: '我的' }
  ];
  function tabbar(cur) {
    // 桌面端侧栏左上角的品牌区（手机端 display:none，不显示）
    var brand = '<div class="sb-brand" role="link" onclick="location.hash=\'#/\'">' +
      '<span class="sb-logo">🤝</span>' +
      '<span class="sb-txt"><span class="sb-name">人生指南</span>' +
      '<span class="sb-sub">高性价比生活手册</span></span></div>';
    var h = '<nav class="tabbar">' + brand;
    TABS.forEach(function (t) {
      var cls = (t.href === cur || (cur === '/ch' || cur === '/detail' || cur === '/search') && t.href === '#/') ? ' on' : '';
      h += '<a href="' + t.href + '" class="' + cls.trim() + '"><span class="ti">' + t.icon + '</span>' + t.text + '</a>';
    });
    return h + '</nav>';
  }

  // ---------- 骨架屏 ----------
  function skeleton() {
    var h = '<div class="card">';
    for (var i = 0; i < 5; i++) {
      h += '<div class="sk sk-t" style="width:' + (92 - i * 11) + '%"></div>';
    }
    return h + '</div>';
  }

  // ================= 首页 =================
  function viewHome() {
    var seq = ++viewSeq;
    document.body.innerHTML = topbar('高性价比人生指南') +
      '<div class="wrap" id="w"><div class="state">正在加载内容…</div></div>' + tabbar('/');

    if (IDX) { renderHome(); return; }
    fetchJSON('index.json').then(function (d) {
      if (seq !== viewSeq) return;
      IDX = d;
      renderHome();
    }).catch(function () {
      if (seq !== viewSeq) return;
      $('#w').innerHTML = '<div class="state">内容加载失败' +
        '<br><button onclick="location.reload()">重新加载</button></div>';
    });
  }

  function renderHome() {
    var seq = viewSeq;
    // 今日一条：按日期取，当天固定
    var todaySeed = Math.floor(Date.now() / 86400000);
    var flat = [];
    IDX.chapters.forEach(function (c) { c.items.forEach(function (i) { flat.push(i); }); });
    var td = flat[todaySeed % flat.length];
    var favN = Object.keys(getFav()).length;
    var readN = Object.keys(getHis()).filter(function (k) { return getHis()[k].f; }).length;

    var h = '';
    // 头部
    h += '<div class="hero"><div class="eyebrow">把日子过得更从容</div>' +
      '<h1>高性价比人生指南</h1>' +
      '<p>收录 ' + IDX.total + ' 条具体做法，每条都标清要花多少钱、花多少时间、能省多少。</p>' +
      '<div class="hero-stats"><div><b>' + IDX.chapterCount + '</b><span>生活章节</span></div>' +
      '<div><b>' + IDX.total + '</b><span>条建议</span></div>' +
      '<div><b>' + readN + '</b><span>已读完</span></div></div></div>';

    // 搜索
    h += '<div class="searchbar"><input id="q" placeholder="搜建议、场景、关键词…" ' +
      'enterkeyhint="search" autocomplete="off"><button onclick="goSearch()">搜索</button></div>';

    // 今日一条
    h += '<div class="card tap" onclick="location.href=\'#/d/' + td.id + '\'">' +
      '<div class="today"><div class="today-main">' +
      '<div class="today-idx">今日一条 · 性价比 ' + td.sc + '</div>' +
      '<div class="today-title">' + esc(td.title) + '</div>' +
      '</div><span style="color:#a8b4af;font-size:18px">↗</span></div></div>';

    // 6 大主题
    h += '<div class="sec-t">按主题浏览</div><div class="sec-tip">把 34 个章节归成 6 类，按你想关心的挑。</div>';
    h += '<div class="grid">';
    IDX.categories.forEach(function (c) {
      var n = c.chapters.reduce(function (s, ci) { return s + IDX.chapters[ci].count; }, 0);
      h += '<button class="g-card" style="background:' + c.color + '" onclick="location.href=\'#/g/' + c.id + '\'">' +
        '<span class="g-count">' + n + ' 条</span>' +
        '<div class="g-icon">' + c.icon + '</div>' +
        '<div class="g-name">' + esc(c.name) + '</div>' +
        '<div class="g-desc">' + esc(c.desc) + '</div></button>';
    });
    h += '</div>';

    // 8 个场景
    h += '<div class="sec-t" style="margin-top:20px">按场景查找</div>' +
      '<div class="sec-tip">当下正遇到什么事？从这里进更直接。</div><div class="grid">';
    IDX.scenarios.forEach(function (s) {
      var n = s.chapters.reduce(function (a, ci) { return a + IDX.chapters[ci].count; }, 0);
      h += '<button class="g-card" onclick="location.href=\'#/g/' + s.id + '\'">' +
        '<span class="g-count">' + n + ' 条</span>' +
        '<div class="g-icon">' + s.icon + '</div>' +
        '<div class="g-name">' + esc(s.name) + '</div>' +
        '<div class="g-desc">' + esc(s.desc) + '</div></button>';
    });
    h += '</div>';

    // 专题清单
    if (IDX.checklists && IDX.checklists.length) {
      h += '<div class="sec-t" style="margin-top:20px">专题清单</div><div class="card" style="padding:4px 16px">';
      IDX.checklists.forEach(function (c) {
        h += '<button class="ch-row" onclick="location.href=\'#/g/' + c.id + '\'">' +
          '<span class="ch-n">' + c.icon + '</span>' +
          '<span class="ch-main"><span class="ch-name">' + esc(c.name) + '</span>' +
          '<span class="ch-sub">' + esc(c.desc) + '</span></span>' +
          '<span class="ch-arrow">›</span></button>';
      });
      h += '</div>';
    }

    // 全部章节
    h += '<div class="sec-t" style="margin-top:20px">全部章节</div>' +
      '<div class="sec-tip">也可以直接按原书顺序读。</div><div class="card" style="padding:4px 16px">';
    IDX.chapters.forEach(function (c) {
      h += '<button class="ch-row" onclick="location.href=\'#/ch/' + c.idx + '\'">' +
        '<span class="ch-n">' + (c.idx + 1) + '</span>' +
        '<span class="ch-main"><span class="ch-name">' + esc(c.title) + '</span>' +
        '<span class="ch-sub">' + c.count + ' 条</span></span>' +
        '<span class="ch-arrow">›</span></button>';
    });
    h += '</div>';

    h += '<div class="foot">内容改编自 GitHub《高性价比人生指南》(eternity4719/HowToLiveBetter)<br>' +
      '收藏与阅读进度只存在你自己这台设备上，不上传服务器</div>';

    $('#w').innerHTML = h;
  }

  // ================= 主题/场景/清单 → 章节聚合 =================
  function viewGroup(gid) {
    var seq = ++viewSeq;
    var g = null, kind = '';
    ['categories', 'scenarios', 'checklists'].forEach(function (k) {
      (IDX[k] || []).forEach(function (x) { if (x.id === gid) { g = x; kind = k; } });
    });
    if (!g) { location.hash = '#/'; return; }

    document.body.innerHTML = topbar(g.name, { back: 1 }) +
      '<div class="wrap" id="w"><div class="state">加载中…</div></div>' + tabbar('/g');

    // 聚合该组所有条目，按评分降序
    var items = [];
    g.chapters.forEach(function (ci) {
      var ch = IDX.chapters[ci];
      ch.items.forEach(function (i) { items.push({ it: i, ch: ch }); });
    });
    items.sort(function (a, b) { return b.it.sc - a.it.sc; });

    var h = '<div class="sec-tip">' + esc(g.desc) + '　共 <b style="color:#0e7c5a">' + items.length + '</b> 条，按性价比从高到低排。</div>';
    h += '<div class="card" style="padding:4px 16px">';
    items.forEach(function (x) {
      var i = x.it, f = isFav(i.id);
      h += '<button class="item-row" onclick="location.href=\'#/d/' + i.id + '\'">' +
        '<span class="badge badge-' + i.tk + '">' + i.sc + '</span>' +
        '<span class="item-main"><span class="item-title">' + esc(i.title) + '</span>' +
        '<span class="item-meta">' + tagChips(i.tg, null) +
        '<span class="chip g">' + esc(x.ch.title) + '</span></span></span>' +
        '<span class="ch-arrow" style="color:' + (f ? '#e24b4a' : '#a8b4af') + '">' + (f ? '♥' : '›') + '</span>' +
        '</button>';
    });
    h += '</div><div class="foot">排序依据为本站在原书标签上算出的性价比指数</div>';
    $('#w').innerHTML = h;
  }

  // ================= 章节详情列表 =================
  function viewChapter(ci) {
    var seq = ++viewSeq;
    var c = IDX.chapters[ci];
    if (!c) { location.hash = '#/'; return; }

    document.body.innerHTML = topbar(c.title, {
      back: 1,
      action: '<button class="tb-act" onclick="sortByScore()">排序</button>'
    }) + '<div class="wrap" id="w">' + skeleton() + '</div>' + tabbar('/ch');

    getChapter(ci).then(function (d) {
      if (seq !== viewSeq) return;
      var items = d.items.map(function (i, ei) {
        return { d: i, meta: c.items[ei] };
      });
      window._chSort = window._chSort || 'src';
      if (window._chSort === 'score') {
        items.sort(function (a, b) { return b.d.sc - a.d.sc; });
      }
      var h = '<div class="sec-tip">第 ' + (ci + 1) + ' 章 · ' + c.count + ' 条 · ' +
        (window._chSort === 'score' ? '按性价比排序' : '原书顺序') + '</div>';
      h += '<div class="card" style="padding:4px 16px">';
      items.forEach(function (x) {
        var i = x.d, f = isFav(i.id);
        h += '<button class="item-row" onclick="location.href=\'#/d/' + i.id + '\'">' +
          '<span class="badge badge-' + tierKey(i.sc) + '">' + i.sc + '</span>' +
          '<span class="item-main"><span class="item-title">' + esc(i.title) + '</span>' +
          '<span class="item-meta">' + tagChips(i.tg, null) + '</span></span>' +
          '<span class="ch-arrow" style="color:' + (f ? '#e24b4a' : '#a8b4af') + '">' + (f ? '♥' : '›') + '</span>' +
          '</button>';
      });
      h += '</div><div class="foot">点右上角可切换「原书顺序 / 性价比排序」</div>';
      $('#w').innerHTML = h;
      document.title = c.title + ' · 高性价比人生指南';
    }).catch(function () {
      if (seq !== viewSeq) return;
      $('#w').innerHTML = '<div class="state">这一章加载失败' +
        '<br><button onclick="location.reload()">重新加载</button></div>';
    });
  }

  function tierKey(sc) {
    if (sc >= 70) return 'S';
    if (sc >= 50) return 'A';
    if (sc >= 30) return 'B';
    return 'C';
  }

  // ================= 单条详情 =================
  function viewDetail(id) {
    var seq = ++viewSeq;
    var ci = parseInt(id.slice(1, id.indexOf('e')), 10);
    var ei = parseInt(id.slice(id.indexOf('e') + 1), 10);
    var ch = IDX.chapters[ci];
    if (!ch) { location.hash = '#/'; return; }

    document.body.innerHTML = topbar('加载中…', { back: 1 }) +
      '<div class="wrap" id="w">' + skeleton() + '</div>' + tabbar('/detail');

    getChapter(ci).then(function (d) {
      if (seq !== viewSeq) return;
      var i = d.items[ei];
      if (!i) { location.hash = '#/ch/' + ci; return; }

      // 记录浏览 + 同章前后条
      touchHis(i.id, { chIdx: ci, ei: ei, title: i.title, chTitle: d.title });
      markRead(i.id); // 打开详情即视为已读（同小程序口径：读完=看过全文）

      var h = '<div class="detail">';
      h += '<div class="d-idx">' + esc(ch.title) + ' · 第 ' + i.num + ' 条</div>';
      h += '<div class="d-title">' + esc(i.title) + '</div>';

      // 评分块
      h += '<div class="d-score"><div><div class="d-score-n">' + i.sc + '</div>' +
        '<div class="d-score-l">性价比指数</div></div><div class="d-score-b">' +
        '<div class="d-score-l">证据可信度 ' + i.tr + ' / 100' +
        (i.level ? '　·证据等级 ' + esc(i.level) : '') + '</div>' +
        '<div class="meter"><i style="width:' + i.tr + '%"></i></div></div></div>';

      // 标签
      h += '<div class="d-meta">';
      TAG_KEYS.forEach(function (k, n) {
        if (i.tg && i.tg[n]) h += '<span class="chip">' + k + ' ' + esc(i.tg[n]) + '</span>';
      });
      h += '</div>';

      if (i.cost) h += '<div class="d-sec"><h3>成本</h3><p>' + esc(i.cost) + '</p></div>';
      if (i.plain) h += '<div class="d-sec"><h3>怎么做</h3><p>' + esc(i.plain) + '</p></div>';
      if (i.benefit) h += '<div class="d-sec"><h3>收益</h3><p>' + esc(i.benefit) + '</p></div>';

      if (i.source || i.note) {
        h += '<div class="d-src">';
        if (i.source) h += '<b>出处</b>：' + esc(i.source) + '<br>';
        if (i.note) h += '<b>备注</b>：' + esc(i.note);
        h += '</div>';
      }

      // 收藏
      h += '</div>';
      h += '<button class="fav-btn' + (isFav(i.id) ? ' on' : '') + '" onclick="doFav(\'' + i.id + '\')">' +
        (isFav(i.id) ? '已收藏 · 点此取消' : '收藏这条建议') + '</button>';

      // 上一条/下一条
      h += '<div class="d-nav" style="margin-top:10px">' +
        '<button onclick="location.href=\'#/d/c' + ci + 'e' + (ei - 1) + '\'"' + (ei <= 0 ? ' disabled' : '') + '>‹ 上一条</button>' +
        '<button onclick="location.href=\'#/d/c' + ci + 'e' + (ei + 1) + '\'"' + (ei >= d.items.length - 1 ? ' disabled' : '') + '>下一条 ›</button>' +
        '</div>';

      // 同章推荐（高分其他条目）
      var others = d.items.filter(function (x) { return x.id !== i.id && x.sc >= 70; }).slice(0, 5);
      if (others.length) {
        h += '<div class="sec-t" style="margin-top:20px">本章其他高性价比建议</div>' +
          '<div class="card" style="padding:4px 16px">';
        others.forEach(function (o) {
          h += '<button class="item-row" onclick="location.href=\'#/d/' + o.id + '\'">' +
            '<span class="badge badge-' + tierKey(o.sc) + '">' + o.sc + '</span>' +
            '<span class="item-main"><span class="item-title">' + esc(o.title) + '</span>' +
            '<span class="item-meta">' + tagChips(o.tg, null) + '</span></span>' +
            '<span class="ch-arrow">›</span></button>';
        });
        h += '</div>';
      }

      h += '<div class="foot">内容改编自 GitHub《高性价比人生指南》<br>仅供参考，具体请结合自身情况判断</div>';

      $('#w').innerHTML = h;
      document.title = i.title + ' · 高性价比人生指南';
      // 详情页滚回顶部
      window.scrollTo(0, 0);
    }).catch(function () {
      if (seq !== viewSeq) return;
      $('#w').innerHTML = '<div class="state">加载失败' +
        '<br><button onclick="location.reload()">重新加载</button></div>';
    });
  }

  // ================= 搜索 =================
  function viewSearch(q) {
    var seq = ++viewSeq;
    q = (q || '').trim();
    document.body.innerHTML = topbar('搜索', { back: 1 }) +
      '<div class="wrap" id="w"><div class="searchbar">' +
      '<input id="q" value="' + esc(q) + '" placeholder="搜建议、场景、关键词…" ' +
      'enterkeyhint="search" autocomplete="off">' +
      '<button onclick="goSearch()">搜索</button></div><div id="rs"></div></div>' + tabbar('/search');

    var rs = $('#rs');
    if (!q) { rs.innerHTML = '<div class="empty">输入关键词开始搜索<br><br>可以搜：安全带、租房押金、职场体检、医保…</div>'; return; }

    // 先在索引里搜标题（快，无需加载分章）
    var hits = [];
    IDX.chapters.forEach(function (c) {
      c.items.forEach(function (i) {
        if (i.title.indexOf(q) >= 0) hits.push({ it: i, ch: c, inBody: false });
      });
    });

    // 标题命中太少时，再去扫正文（分章并行拉取）
    if (hits.length < 8) {
      rs.innerHTML = '<div class="state">正在搜索正文…</div>';
      var jobs = IDX.chapters.map(function (c) {
        return getChapter(c.idx).then(function (d) {
          d.items.forEach(function (i, ei) {
            if (i.title.indexOf(q) >= 0) return; // 标题已收
            var body = [i.cost, i.plain, i.benefit].join(' ');
            var p = body.indexOf(q);
            if (p >= 0) {
              var s = Math.max(0, p - 28);
              hits.push({
                it: c.items[ei], ch: c, inBody: true,
                snip: (s > 0 ? '…' : '') + body.slice(s, p + q.length + 56) + '…',
                hl: q
              });
            }
          });
        }).catch(function () {});
      });
      Promise.all(jobs).then(function () {
        if (seq !== viewSeq) return;
        renderSearch(rs, q, hits);
      });
    } else {
      renderSearch(rs, q, hits);
    }
  }

  function renderSearch(box, q, hits) {
    if (!hits.length) {
      box.innerHTML = '<div class="empty">没找到「' + esc(q) + '」相关内容<br><br>换个词试试，或去「按场景查找」</div>';
      return;
    }
    // 标题命中排前
    hits.sort(function (a, b) {
      if (a.inBody !== b.inBody) return a.inBody ? 1 : -1;
      return b.it.sc - a.it.sc;
    });
    var h = '<div class="sec-tip">找到 ' + hits.length + ' 条含「<b style="color:#0e7c5a">' + esc(q) + '</b>」的结果</div>';
    h += '<div class="card" style="padding:4px 16px">';
    hits.slice(0, 200).forEach(function (x) {
      var i = x.it;
      var snip = x.inBody
        ? '<div class="res-snip">' + esc(x.snip).replace(
            new RegExp(esc(x.hl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            function (m) { return '<mark>' + m + '</mark>'; }) + '</div>'
        : '';
      h += '<button class="res-item" onclick="location.href=\'#/d/' + i.id + '\'">' +
        '<div class="res-title">' + esc(i.title) + '</div>' +
        '<div class="res-where">' + esc(x.ch.title) + ' · 第 ' + i.num + ' 条 · 性价比 ' + i.sc + '</div>' +
        snip + '</button>';
    });
    h += '</div>';
    if (hits.length > 200) h += '<div class="sec-tip" style="text-align:center">仅显示前 200 条</div>';
    box.innerHTML = h;
  }

  // ================= 收藏 =================
  function viewFav() {
    var seq = ++viewSeq;
    document.body.innerHTML = topbar('我的收藏') +
      '<div class="wrap" id="w"></div>' + tabbar('/fav');

    var fav = getFav();
    var ids = Object.keys(fav);
    if (!ids.length) {
      $('#w').innerHTML = '<div class="empty">还没有收藏<br><br>看到有用的点一下 ❤ 就存下来了<br>收藏只存在这台设备上</div>';
      return;
    }

    var h = '<div class="sec-tip">共 ' + ids.length + ' 条 · 按收藏时间倒序</div><div class="card" style="padding:4px 16px">';
    var rows = [];
    ids.forEach(function (id) {
      var m = /^c(\d+)e(\d+)$/.exec(id);
      if (!m) return;
      var ci = +m[1], ei = +m[2];
      var c = IDX.chapters[ci];
      if (!c || !c.items[ei]) return;
      rows.push({ it: c.items[ei], ch: c, ts: fav[id] });
    });
    rows.sort(function (a, b) { return b.ts - a.ts; });
    rows.forEach(function (x) {
      var i = x.it;
      h += '<button class="item-row" onclick="location.href=\'#/d/' + i.id + '\'">' +
        '<span class="badge badge-' + i.tk + '">' + i.sc + '</span>' +
        '<span class="item-main"><span class="item-title">' + esc(i.title) + '</span>' +
        '<span class="item-meta"><span class="chip g">' + esc(x.ch.title) + '</span>' +
        tagChips(i.tg, null) + '</span></span>' +
        '<span class="ch-arrow" style="color:#e24b4a">♥</span></button>';
    });
    h += '</div>' +
      '<button class="fav-btn" style="margin-top:4px;background:#fff;color:#e24b4a;box-shadow:inset 0 0 0 1px #f3d4d4" ' +
      'onclick="clearFav()">清空收藏</button>' +
      '<div class="foot">收藏数据保存在浏览器本地存储里，清空浏览器数据会丢失</div>';
    $('#w').innerHTML = h;
  }

  // ================= 我的 =================
  function viewMine() {
    var seq = ++viewSeq;
    document.body.innerHTML = topbar('我的') + '<div class="wrap" id="w"></div>' + tabbar('/mine');

    var his = getHis();
    var readIds = Object.keys(his).filter(function (k) { return his[k].f; });
    var favN = Object.keys(getFav()).length;
    // 读过的章节数
    var readChs = {};
    readIds.forEach(function (k) { if (his[k].c != null) readChs[his[k].c] = 1; });

    var h = '<div class="card"><div class="sec-t" style="margin:0 0 4px">我的生活手册</div>' +
      '<div class="hero-stats" style="border:none;padding:8px 0 0">' +
      '<div><b style="color:#0e7c5a">' + favN + '</b><span>已收藏</span></div>' +
      '<div><b style="color:#0e7c5a">' + readIds.length + '</b><span>已读完</span></div>' +
      '<div><b style="color:#0e7c5a">' + Object.keys(readChs).length + '</b><span>读过的章节</span></div>' +
      '</div></div>';

    // 继续读
    var recent = Object.keys(his).sort(function (a, b) { return his[b].t - his[a].t; }).slice(0, 5);
    if (recent.length) {
      h += '<div class="sec-t">接着读</div><div class="card" style="padding:4px 16px">';
      recent.forEach(function (k) {
        var x = his[k];
        if (!IDX.chapters[x.c]) return;
        h += '<button class="ch-row" onclick="location.href=\'#/d/' + k + '\'">' +
          '<span class="ch-n">' + (x.c + 1) + '</span>' +
          '<span class="ch-main"><span class="ch-name">' + esc(x.n) + '</span>' +
          '<span class="ch-sub">' + esc(x.ch) + '</span></span>' +
          '<span class="ch-arrow">›</span></button>';
      });
      h += '</div>';
    }

    // 随机一条
    h += '<button class="card tap" style="width:100%;display:flex;align-items:center;gap:12px" onclick="randomOne()">' +
      '<span style="font-size:20px">🎲</span>' +
      '<span class="today-title" style="flex:1;text-align:left">随机来一条</span>' +
      '<span style="color:#a8b4af">↗</span></button>';

    // 关于
    h += '<div class="sec-t">关于</div><div class="card">' +
      '<div class="about-row"><span class="about-k">共收录</span><span class="about-v">' + IDX.total + ' 条建议</span></div>' +
      '<div class="about-row"><span class="about-k">章节</span><span class="about-v">' + IDX.chapterCount + ' 个</span></div>' +
      '<div class="about-row"><span class="about-k">数据来源</span><span class="about-v">GitHub《高性价比人生指南》</span></div>' +
      '<div class="about-row"><span class="about-k">存储方式</span><span class="about-v">本机保存 · 无需登录</span></div>' +
      '</div>';

    // 工具
    h += '<div class="card" style="padding:4px 16px">' +
      '<button class="ch-row" onclick="exportData()"><span class="ch-n">⬇</span>' +
      '<span class="ch-main"><span class="ch-name">导出我的收藏</span>' +
      '<span class="ch-sub">存成文本文件，方便备份</span></span><span class="ch-arrow">›</span></button>' +
      '<button class="ch-row" onclick="clearAll()"><span class="ch-n">🗑</span>' +
      '<span class="ch-main"><span class="ch-name">清空本机数据</span>' +
      '<span class="ch-sub">收藏与阅读记录全部删除</span></span><span class="ch-arrow">›</span></button>' +
      '</div>';

    h += '<div class="foot">内容改编自 GitHub《高性价比人生指南》<br>配色与排版为本站独立设计 · 仅供参考，不构成医疗或法律建议</div>';

    $('#w').innerHTML = h;
  }

  // ================= 交互动作 =================
  window.doFav = function (id) {
    var on = toggleFav(id);
    toast(on ? '已收藏' : '已取消收藏');
    // 局部更新按钮与当前列表里的心形
    var btn = document.querySelector('.fav-btn');
    if (btn) { btn.className = 'fav-btn' + (on ? ' on' : ''); btn.textContent = on ? '已收藏 · 点此取消' : '收藏这条建议'; }
  };
  window.goSearch = function () {
    var v = ($('#q') && $('#q').value) || '';
    location.hash = '#/s/' + encodeURIComponent(v);
  };
  window.sortByScore = function () {
    window._chSort = window._chSort === 'score' ? 'src' : 'score';
    var m = /#\/ch\/(\d+)/.exec(location.hash);
    if (m) viewChapter(+m[1]);
  };
  window.randomOne = function () {
    var all = IDX.chapters.reduce(function (a, c) { return a + c.count; }, 0);
    var r = Math.floor(Math.random() * all);
    for (var i = 0; i < IDX.chapters.length; i++) {
      if (r < IDX.chapters[i].count) { location.hash = '#/ch/' + i; return; }
      r -= IDX.chapters[i].count;
    }
  };
  window.clearFav = function () {
    if (!confirm('确定清空全部收藏？此操作不可撤销。')) return;
    localStorage.removeItem(LS_FAV);
    toast('已清空收藏');
    viewFav();
  };
  window.clearAll = function () {
    if (!confirm('将删除本机的全部收藏与阅读记录，确定继续？')) return;
    localStorage.removeItem(LS_FAV);
    localStorage.removeItem(LS_HIS);
    localStorage.removeItem(LS_PROF);
    toast('已清空');
    viewMine();
  };
  window.exportData = function () {
    var fav = getFav(), his = getHis();
    var ids = Object.keys(fav);
    if (!ids.length) { toast('还没有收藏可导出'); return; }
    var lines = ['我的收藏 · 高性价比人生指南', '导出于 ' + new Date().toLocaleString('zh-CN'), ''];
    ids.sort(function (a, b) { return fav[b] - fav[a]; });
    ids.forEach(function (id, n) {
      var m = /^c(\d+)e(\d+)$/.exec(id);
      if (!m) return;
      var c = IDX.chapters[+m[1]], it = c && c.items[+m[2]];
      if (it) lines.push(n + 1 + '. [' + c.title + '] ' + it.title + '（性价比 ' + it.sc + '）');
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '高性价比人生指南-我的收藏.txt';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('已导出');
  };

  // ================= 路由 =================
  // 需要索引的页面：收藏/我的/搜索/主题/详情
  // 首次进入时索引还没来，先把 index.json 拉到内存再渲染，避免空白页
  function route() {
    var h = location.hash || '#/';
    var m;
    if (h === '#/' || h === '#') return viewHome();
    if ((m = /^#\/ch\/(\d+)$/.exec(h))) {
      if (!IDX) return bootThen(h);
      return viewChapter(+m[1]);
    }
    if ((m = /^#\/d\/(c\d+e\d+)$/.exec(h))) {
      if (!IDX) return bootThen(h);
      return viewDetail(m[1]);
    }
    if ((m = /^#\/g\/([\w-]+)$/.exec(h))) {
      if (!IDX) return bootThen(h);
      return viewGroup(m[1]);
    }
    if ((m = /^#\/s\/(.*)$/.exec(h))) {
      if (!IDX) return bootThen(h);
      return viewSearch(decodeURIComponent(m[1]));
    }
    if (h === '#/fav') {
      if (!IDX) return bootThen(h);
      return viewFav();
    }
    if (h === '#/mine') {
      if (!IDX) return bootThen(h);
      return viewMine();
    }
    location.hash = '#/';
  }

  // 索引未就绪时：先拉 index.json，保留原 hash 再渲染
  var booting = false;
  function bootThen(hash) {
    document.body.innerHTML = '<div class="state">正在加载内容…</div>';
    if (IDX || booting) return;
    booting = true;
    fetchJSON('index.json').then(function (d) {
      IDX = d; booting = false;
      // hash 未变则 hashchange 不会触发，手动再路由一次
      if (location.hash === hash) route();
    }).catch(function () {
      booting = false;
      document.body.innerHTML = '<div class="state">内容加载失败，请检查网络' +
        '<br><button onclick="location.reload()">重新加载</button></div>';
    });
  }

  window.addEventListener('hashchange', route);

  // 首次进入
  route();
})();
