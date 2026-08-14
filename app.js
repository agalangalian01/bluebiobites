"use strict";
(() => {

  /* ---------------------------------------------------------------- */
  /* Root path                                                         */
  /* ---------------------------------------------------------------- */
  // app.js is loaded both from the site root (index.html) and from nested
  // pre-rendered article pages (articulo/<slug>/index.html), so any
  // relative reference this file builds (assets, content/*.json) must be
  // resolved against app.js's OWN location, not the current page's depth.
  const ROOT_PREFIX = (function () {
    try {
      const cur = document.currentScript && document.currentScript.src;
      if (cur) return new URL('.', cur).pathname.replace(/\/$/, '');
    } catch (e) { /* ignore */ }
    return '';
  })();

  /* ---------------------------------------------------------------- */
  /* Supabase (comentarios)                                            */
  /* ---------------------------------------------------------------- */
  // Sustituye estos dos valores por los de tu propio proyecto de Supabase
  // (Project Settings -> Data API -> Project URL / anon public key).
  // La clave "anon" está pensada para ser pública: la seguridad real la
  // dan las políticas RLS de la tabla "comments", no el secreto de esta clave.
  const SUPABASE_URL = 'https://xxexeinfestvfdergcmx.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_q91EF5thttjxP5_3tuOWHQ_X4Nz1VRM';
  const sb = (typeof supabase !== 'undefined' && SUPABASE_URL.indexOf('PON_AQUI') === -1)
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  /* ---------------------------------------------------------------- */
  /* Data                                                              */
  /* ---------------------------------------------------------------- */

  const CATS = {
    bio:   {name:'Biología marina', short:'Biología marina', accent:'#17A398', bgLight:'#E1F5EE', dark:'#085041', emoji:'🐟', tintA:'#e6f4f1', tintB:'#dcefeb'},
    eco:   {name:'Ecología marina y conservación', short:'Ecología', accent:'#4C9A63', bgLight:'#E7F3E9', dark:'#2E5F3B', emoji:'🌿', tintA:'#e9f3ea', tintB:'#e0ece2'},
    micro: {name:'Microbiología marina', short:'Microbiología', accent:'#7B5EA7', bgLight:'#EDE7F5', dark:'#4A3766', emoji:'🧫', tintA:'#efe9f6', tintB:'#e7dff1'},
    biot:  {name:'Biotecnología marina', short:'Biotecnología', accent:'#F2665E', bgLight:'#FCEBE9', dark:'#7A2E28', emoji:'💧', tintA:'#fceceb', tintB:'#f8e0de'},
    quim:  {name:'Química y bioquímica marina', short:'Química', accent:'#D98E2B', bgLight:'#FBF0DD', dark:'#6B4614', emoji:'🧪', tintA:'#fbf1de', tintB:'#f6e8cd'},
    gen:   {name:'Genética y genómica marina', short:'Genética', accent:'#C9558B', bgLight:'#FBEAF0', dark:'#6E2C4B', emoji:'🧬', tintA:'#fbeef0', tintB:'#f7e6e9'},
    ocea:  {name:'Oceanografía y geología marina', short:'Oceanografía', accent:'#4A6B8A', bgLight:'#E7EDF2', dark:'#2A3E50', emoji:'🌊', tintA:'#e7edf2', tintB:'#dee6ed'},
    acui:  {name:'Acuicultura y ciencias pesqueras', short:'Acuicultura', accent:'#5C8A6B', bgLight:'#E9F1EA', dark:'#2F4A38', emoji:'🐠', tintA:'#e9f1ea', tintB:'#e0ebe2'}
  };

  const TYPES = {
    noticia: {label:'Noticia', emoji:'📰', accent:'#0B3D57', bgLight:'#E7ECEF', dark:'#0B3D57'},
    tecnica: {label:'Técnica', emoji:'🔬', accent:'#17A398', bgLight:'#E1F5EE', dark:'#085041'}
  };

  let ARTICLES = [];

  let BIO = [];

  let EVENTS = [];
  let GLOSARIO = [];

  const NAV_ITEMS = [['inicio','Inicio'],['sobre','Sobre mí'],['articulos','Artículos'],['agenda','Agenda'],['glosario','Glosario']];
  const PER_PAGE = 6;

  /* ---------------------------------------------------------------- */
  /* State                                                             */
  /* ---------------------------------------------------------------- */

  const state = {
    page: 'inicio', slug: null, cats: [], types: [], query: '', pageNum: 1, agendaType: null, agendaView: 'list',
    searchOpen: false, menuOpen: false, draft: '', email: '', subscribed: false,
    comments: {},
    commentName: '', commentEmail: '', replyingTo: null,
    commentError: null, commentSent: false
  };

  let suppressHashHandling = false;

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function deco(a) {
    const c = CATS[a.cat];
    const t = TYPES[a.type];
    return Object.assign({}, a, {
      catName: c.name, catShort: c.short, accent: c.accent, bgLight: c.bgLight,
      dark: c.dark, emoji: c.emoji, tintA: c.tintA, tintB: c.tintB,
      typeLabel: t.label, typeEmoji: t.emoji, typeAccent: t.accent, typeBgLight: t.bgLight, typeDark: t.dark
    });
  }

  function filteredArticles() {
    const q = state.query.trim().toLowerCase();
    return ARTICLES.filter(a => {
      if (state.cats.length && state.cats.indexOf(a.cat) === -1) return false;
      if (state.types.length && state.types.indexOf(a.type) === -1) return false;
      if (!q) return true;
      return (a.title + ' ' + a.excerpt + ' ' + CATS[a.cat].name).toLowerCase().indexOf(q) !== -1;
    });
  }

  function currentArticle() {
    return ARTICLES.find(a => a.slug === state.slug) || ARTICLES[0];
  }

  function commentsKey() {
    return state.page === 'articulo' ? currentArticle().slug : 'general';
  }

  async function fetchComments() {
    if (!sb) return; // Supabase aún no configurado: no hay comentarios que mostrar
    const { data, error } = await sb
      .from('comments')
      .select('id, article_slug, parent_id, name, text, is_author, created_at')
      .eq('approved', true)
      .order('created_at', { ascending: true });
    if (error) { console.error('Error cargando comentarios:', error); return; }

    const byId = {};
    (data || []).forEach(c => { byId[c.id] = Object.assign({}, c, {replies: []}); });
    const grouped = {};
    (data || []).forEach(c => {
      const node = byId[c.id];
      if (c.parent_id && byId[c.parent_id]) {
        byId[c.parent_id].replies.push(node);
      } else {
        grouped[c.article_slug] = grouped[c.article_slug] || [];
        grouped[c.article_slug].push(node);
      }
    });
    state.comments = grouped;
  }

  async function submitComment() {
    const text = state.draft.trim();
    const name = state.commentName.trim();
    const email = state.commentEmail.trim();
    if (!name || !email || !text) {
      state.commentError = 'Rellena tu nombre, tu email y el comentario.';
      render();
      return;
    }
    if (email.indexOf('@') <= 0) {
      state.commentError = 'Revisa el email, no parece válido.';
      render();
      return;
    }
    if (!sb) {
      state.commentError = 'Los comentarios todavía no están activados en esta web.';
      render();
      return;
    }
    const key = commentsKey();
    const { error } = await sb.from('comments').insert({
      article_slug: key,
      parent_id: state.replyingTo,
      name, email, text,
      approved: false,
      is_author: false
    });
    if (error) {
      console.error('Error enviando comentario:', error);
      state.commentError = 'No se ha podido enviar el comentario. Inténtalo de nuevo.';
      render();
      return;
    }
    state.draft = '';
    state.replyingTo = null;
    state.commentError = null;
    state.commentSent = true;
    render();
  }

  function parseHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return {page: 'inicio', slug: null};
    const parts = h.split('/');
    if (parts[0] === 'articulo' && parts[1]) return {page: 'articulo', slug: decodeURIComponent(parts[1])};
    if (['sobre', 'articulos', 'agenda', 'inicio', 'glosario'].indexOf(parts[0]) !== -1) return {page: parts[0], slug: null};
    return {page: 'inicio', slug: null};
  }

  function syncHash() {
    const target = state.page === 'inicio' ? '#/'
      : state.page === 'articulo' ? '#/articulo/' + encodeURIComponent(state.slug)
      : '#/' + state.page;
    // Direct links to a pre-rendered article page (articulo/<slug>/index.html)
    // land on a real, nested pathname. Once the visitor navigates anywhere
    // else inside the SPA, reset the pathname back to the site root so hash
    // URLs stay clean instead of accumulating a stale nested path.
    const rootPath = ROOT_PREFIX + '/';
    if (location.pathname !== rootPath && location.pathname !== ROOT_PREFIX) {
      history.replaceState(null, '', rootPath + target);
    } else {
      suppressHashHandling = true;
      location.hash = target;
    }
  }

  // Slug encoded in a pre-rendered article URL (articulo/<slug>/), used as a
  // fallback initial route when the page is opened directly (no hash yet).
  function parsePathnameArticleSlug() {
    let path = location.pathname;
    if (ROOT_PREFIX && path.indexOf(ROOT_PREFIX) === 0) path = path.slice(ROOT_PREFIX.length);
    const m = path.match(/\/articulo\/([^/]+)\/?(?:index\.html)?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function go(page, extra) {
    Object.assign(state, {page, menuOpen: false, draft: ''}, extra || {});
    syncHash();
    window.scrollTo(0, 0);
    render();
  }

  function pageTitle() {
    switch (state.page) {
      case 'sobre': return 'Sobre mí — BlueBioBites';
      case 'articulos': return 'Artículos — BlueBioBites';
      case 'articulo': return currentArticle().title + ' — BlueBioBites';
      case 'agenda': return 'Agenda — BlueBioBites';
      case 'glosario': return 'Glosario — BlueBioBites';
      default: return 'BlueBioBites — El mar, explicado a bocados';
    }
  }

  function pageDescription() {
    switch (state.page) {
      case 'sobre': return 'Sobre Alejandro Galán: Ciencias del Mar y Máster en Biotecnología para la Salud y la Sostenibilidad (UA).';
      case 'articulos': return 'Artículos de biología, ecología, microbiología, biotecnología, química, genética, oceanografía y acuicultura marina.';
      case 'articulo': return currentArticle().excerpt;
      case 'agenda': return 'Charlas, congresos y talleres sobre ciencia marina en Alicante, Elche, Murcia y alrededores.';
      case 'glosario': return 'Glosario ilustrado de términos de biología y biotecnología marina, explicados con rigor y sin jerga.';
      default: return 'Ciencias marinas contadas con el rigor del laboratorio y sin la jerga que sobra, por Alejandro Galán.';
    }
  }

  function setMeta(name, content) {
    let el = document.querySelector('meta[name="' + name + '"], meta[property="' + name + '"]');
    if (el) el.setAttribute('content', content);
  }

  /* ---------------------------------------------------------------- */
  /* Render: header / footer                                          */
  /* ---------------------------------------------------------------- */

  function renderHeader() {
    const navItem = (id, label, mobile) => {
      const active = state.page === id || (id === 'articulos' && state.page === 'articulo');
      const bar = active ? '#17A398' : 'transparent';
      const op = state.page === id ? '1' : '.62';
      return mobile
        ? `<span data-action="nav" data-page="${id}" role="button" tabindex="0" style="cursor:pointer;padding:11px 4px;font-size:16px;opacity:${op}">${esc(label)}</span>`
        : `<span data-action="nav" data-page="${id}" role="button" tabindex="0" style="cursor:pointer;padding-bottom:3px;border-bottom:2px solid ${bar};opacity:${op}">${esc(label)}</span>`;
    };

    return `
<header style="position:sticky;top:0;z-index:20;background:#0B3D57;color:#fff">
  <div class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:14px;padding-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:24px">
    <div data-action="nav" data-page="inicio" role="button" tabindex="0" style="display:flex;align-items:center;gap:12px;cursor:pointer"><img src="${ROOT_PREFIX}/assets/logo.png" alt="BlueBioBites" width="619" height="695" style="width:40px;height:auto;display:block;filter:brightness(0) invert(1)"><span style="font-size:19px;letter-spacing:-.01em">bluebiobites</span></div>
    <nav class="bbb-nav" style="gap:30px;font-size:15px">
      ${NAV_ITEMS.map(([id, label]) => navItem(id, label, false)).join('')}
    </nav>
    <div style="display:flex;align-items:center;gap:10px">
      ${state.searchOpen ? `<input class="bbb-search-input" data-bind="query" aria-label="Buscar artículos" value="${esc(state.query)}" placeholder="Buscar artículos…" style="background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);color:#fff;border-radius:999px;padding:9px 16px;font-size:14px;outline:none;width:210px">` : ''}
      <div data-action="toggle-search" role="button" tabindex="0" aria-label="${state.searchOpen ? 'Cerrar buscador' : 'Buscar'}" aria-expanded="${state.searchOpen}" style="cursor:pointer;flex:none;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.3);display:grid;place-items:center;font-size:15px">⌕</div>
      <div class="bbb-burger" data-action="toggle-menu" role="button" tabindex="0" aria-label="${state.menuOpen ? 'Cerrar menú' : 'Abrir menú'}" aria-expanded="${state.menuOpen}" style="cursor:pointer;flex:none;width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.3);place-items:center;font-size:15px">☰</div>
    </div>
  </div>
  ${state.searchOpen ? `
  <div class="bbb-search-mobile-row" style="border-top:1px solid rgba(255,255,255,.15);padding:12px 22px;gap:10px">
    <input class="bbb-search-input-mobile" data-bind="query" aria-label="Buscar artículos" value="${esc(state.query)}" placeholder="Buscar artículos…" style="flex:1;min-width:0;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);color:#fff;border-radius:999px;padding:9px 16px;font-size:14px;outline:none">
  </div>` : ''}
  ${state.menuOpen ? `
  <div style="border-top:1px solid rgba(255,255,255,.15);padding:10px 22px 16px;display:flex;flex-direction:column;gap:2px">
    ${NAV_ITEMS.map(([id, label]) => navItem(id, label, true)).join('')}
  </div>` : ''}
</header>`;
  }

  function renderFooter() {
    return `
<footer style="background:#08293f;color:#fff">
  <div class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:46px;padding-bottom:22px">
    <div class="bbb-row bbb-row-center" style="display:flex;gap:32px;padding:26px 28px;margin-bottom:38px;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:rgba(23,163,152,.1)">
      <div style="flex:1;min-width:240px">
        <div style="font-size:19px;letter-spacing:-.01em">Un bocado al mes en tu correo</div>
        <p style="margin:6px 0 0;font-size:14.5px;line-height:1.55;opacity:.72;max-width:46ch">Los artículos nuevos y los eventos de la agenda. Sin spam, y te puedes dar de baja cuando quieras.</p>
      </div>
      ${state.subscribed ? `
      <div style="flex:none;display:flex;align-items:center;gap:10px;font-size:15px;color:#17A398">✓ <span style="color:#fff;opacity:.85">Apuntado. Gracias.</span></div>` : `
      <div style="flex:none;display:flex;flex-direction:column;gap:6px">
        <form class="bbb-row" data-newsletter-form action="https://buttondown.com/api/emails/embed-subscribe/bluebiobites" method="post" target="bbb-subscribe-frame" style="display:flex;gap:10px">
          <input type="email" name="email" required data-bind="email" aria-label="Tu correo electrónico para la newsletter" value="${esc(state.email)}" placeholder="tu@correo.com" style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.28);color:#fff;border-radius:8px;padding:13px 16px;font-size:14.5px;outline:none;width:250px">
          <button type="submit" style="cursor:pointer;background:#F2665E;color:#fff;border:none;padding:13px 26px;border-radius:8px;font-size:14.5px;text-align:center;white-space:nowrap">Suscribirme</button>
        </form>
        <a href="https://buttondown.com/refer/bluebiobites" target="_blank" rel="noopener" style="font-size:11px;color:#fff;opacity:.45;text-decoration:none;align-self:flex-end">Powered by Buttondown.</a>
      </div>`}
    </div>
    <div class="bbb-3col bbb-3col-footer" style="display:grid;gap:40px">
      <div><img src="${ROOT_PREFIX}/assets/logo.png" alt="" width="619" height="695" loading="lazy" style="width:64px;height:auto;display:block;filter:brightness(0) invert(1);opacity:.9"><p style="margin:14px 0 0;font-size:15px;opacity:.75"><i>El mar, explicado a bocados.</i></p></div>
      <div style="display:flex;flex-direction:column;gap:9px;font-size:14.5px">
        ${NAV_ITEMS.map(([id, label]) => `<span data-action="nav" data-page="${id}" role="button" tabindex="0" style="cursor:pointer;opacity:.8">${esc(label)}</span>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:9px;font-size:14.5px">
        <a href="https://www.instagram.com/bluebiobites" target="_blank" rel="noopener" style="color:#fff;opacity:.8;text-decoration:none">Instagram @bluebiobites</a>
        <a href="https://www.linkedin.com/in/alejandrogalangalian" target="_blank" rel="noopener" style="color:#fff;opacity:.8;text-decoration:none">LinkedIn · Alejandro Galán</a>
        <a href="mailto:bluebiobites@gmail.com" style="color:#fff;opacity:.8;text-decoration:none">bluebiobites@gmail.com</a>
      </div>
    </div>
    <div style="margin-top:34px;padding-top:16px;border-top:1px solid rgba(255,255,255,.15);font-size:13px;opacity:.6">© 2026 BlueBioBites &middot; <a href="${ROOT_PREFIX}/privacidad.html" style="color:#fff;opacity:.85">Política de privacidad</a></div>
  </div>
</footer>`;
  }

  const COMMENT_COLORS = ['#17A398','#0B3D57','#7B5EA7','#C9558B','#4C9A63','#D98E2B','#4A6B8A','#F2665E'];
  function colorForName(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return COMMENT_COLORS[h % COMMENT_COLORS.length];
  }

  function timeAgo(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'ahora mismo';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `hace ${d} d`;
    const w = Math.floor(d / 7);
    if (w < 5) return `hace ${w} sem`;
    const mo = Math.floor(d / 30);
    return `hace ${mo} mes${mo === 1 ? '' : 'es'}`;
  }

  function renderCommentNode(c, isReply) {
    const bg = state.page === 'articulo' ? '#F7F1E3' : '#fff';
    const badge = c.is_author ? `<span style="background:#17A398;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;margin-left:8px;vertical-align:middle">Autor</span>` : '';
    const replyBtn = isReply ? '' : `<span data-action="reply-to" data-comment-id="${esc(c.id)}" data-comment-name="${esc(c.name)}" role="button" tabindex="0" style="cursor:pointer;color:#17A398;font-size:13px;margin-top:6px;display:inline-block">Responder</span>`;
    const replies = (c.replies && c.replies.length)
      ? `<div style="display:flex;flex-direction:column;gap:14px;margin-top:14px;padding-left:24px;border-left:2px solid #e2ddd2">${c.replies.map(r => renderCommentNode(r, true)).join('')}</div>`
      : '';
    return `
  <div style="display:flex;gap:14px">
    <span style="flex:none;width:38px;height:38px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:14px;background:${colorForName(c.name)}">${esc(c.name.charAt(0).toUpperCase())}</span>
    <div style="flex:1">
      <div style="background:${bg};border-radius:4px 14px 14px 14px;padding:14px 18px">
        <div style="font-size:13.5px;color:#0B3D57;margin-bottom:5px">${esc(c.name)}${badge} · ${timeAgo(c.created_at)}</div>
        <p style="margin:0;font-size:14.5px;line-height:1.6;color:#12293A;opacity:.85">${esc(c.text)}</p>
      </div>
      ${replyBtn}
      ${replies}
    </div>
  </div>`;
  }

  function renderComments(key) {
    const list = state.comments[key] || [];
    const flat = list.concat(...list.map(c => c.replies || []));
    const replyingComment = state.replyingTo ? flat.find(c => c.id === state.replyingTo) : null;

    return `
<div style="display:flex;flex-direction:column;gap:18px${state.page === 'articulo' ? '' : ';max-width:780px'}">
  ${list.length ? list.map(c => renderCommentNode(c, false)).join('') : `<p style="margin:0;font-size:14.5px;color:#12293A;opacity:.6">Todavía no hay comentarios. ¡Sé el primero!</p>`}

  ${!sb ? `<p style="margin:0;font-size:13.5px;color:#F2665E">Los comentarios están desactivados de momento en esta web.</p>` : `
  <div style="background:${state.page === 'articulo' ? '#fff' : '#F7F1E3'};border-radius:14px;padding:18px;margin-top:4px">
    ${replyingComment ? `<div style="display:flex;justify-content:space-between;align-items:center;font-size:13.5px;color:#0B3D57;margin-bottom:10px">
      <span>Respondiendo a <strong>${esc(replyingComment.name)}</strong></span>
      <span data-action="cancel-reply" role="button" tabindex="0" style="cursor:pointer;color:#F2665E">Cancelar</span>
    </div>` : ''}
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">
      <input data-bind="commentName" aria-label="Tu nombre" value="${esc(state.commentName)}" placeholder="Tu nombre" style="flex:1;min-width:140px;background:#fff;border:1px solid #e2ddd2;border-radius:10px;padding:12px 16px;font-size:14px;color:#12293A;outline:none">
      <input data-bind="commentEmail" aria-label="Tu email (no se publica)" value="${esc(state.commentEmail)}" placeholder="Tu email (no se publica)" style="flex:1;min-width:180px;background:#fff;border:1px solid #e2ddd2;border-radius:10px;padding:12px 16px;font-size:14px;color:#12293A;outline:none">
    </div>
    <div class="bbb-row" style="display:flex;gap:12px">
      <input data-bind="draft" aria-label="Escribe un comentario" value="${esc(state.draft)}" placeholder="Escribe un comentario…" style="flex:1;background:#fff;border:1px solid #e2ddd2;border-radius:10px;padding:14px 18px;font-size:14.5px;color:#12293A;outline:none">
      <span data-action="submit-comment" role="button" tabindex="0" style="cursor:pointer;background:#0B3D57;color:#fff;padding:14px 26px;border-radius:10px;font-size:14.5px;text-align:center">Enviar</span>
    </div>
    ${state.commentError ? `<p style="margin:10px 0 0;font-size:13px;color:#F2665E">${esc(state.commentError)}</p>` : ''}
    ${state.commentSent ? `<p style="margin:10px 0 0;font-size:13px;color:#17A398">¡Gracias! Tu comentario queda pendiente de revisión y se publicará en breve.</p>` : ''}
    <p style="margin:10px 0 0;font-size:12px;color:#12293A;opacity:.55">Tu email no se muestra públicamente; solo se usa para poder contactarte si hace falta.</p>
  </div>
  `}
</div>`;
  }

  /* ---------------------------------------------------------------- */
  /* Render: pages                                                     */
  /* ---------------------------------------------------------------- */

  function renderInicio() {
    const featured = deco(ARTICLES[0]);
    const secondary = ARTICLES.slice(1, 4).map(deco);
    const nextEvent = EVENTS.filter(e => e.upcoming)[0];

    return `
<main>
  <div style="position:relative;background:linear-gradient(180deg,#0B3D57 0%,#0a3550 55%,#08293f 100%);color:#fff;overflow:hidden">
    <div style="position:absolute;inset:0;background:radial-gradient(circle at 18% 28%,rgba(23,163,152,.28),transparent 44%),radial-gradient(circle at 84% 74%,rgba(242,102,94,.16),transparent 46%)"></div>
    <div style="position:absolute;left:60%;top:12%;width:10px;height:10px;border-radius:50%;background:#17A398;opacity:.7"></div>
    <div style="position:absolute;left:52%;top:62%;width:18px;height:18px;border-radius:50%;background:#17A398;opacity:.28"></div>
    <div style="position:absolute;left:92%;top:38%;width:7px;height:7px;border-radius:50%;background:#17A398;opacity:.55"></div>
    <div class="bbb-pad bbb-hero" style="position:relative;max-width:1180px;margin:0 auto;padding-top:84px;padding-bottom:92px;display:grid;gap:56px;align-items:center">
      <div>
        <div style="font-size:12px;letter-spacing:.2em;color:#17A398;margin-bottom:22px">Por Alejandro Galán, Ciencias del Mar + Máster en Biotecnología (UA).</div>
        <h1 class="bbb-h1" style="margin:0;line-height:1;letter-spacing:-.035em;font-weight:500;text-wrap:balance;font-style:italic;text-decoration-line:none">El mar,<br>explicado a bocados.</h1>
        <p style="margin:26px 0 0;max-width:52ch;font-size:19px;line-height:1.6;opacity:.78;text-wrap:pretty">Ciencias marinas contadas con el rigor del laboratorio y sin la jerga que sobra.&nbsp;</p>
        <div style="display:flex;gap:14px;margin-top:36px;align-items:center;flex-wrap:wrap">
          <span data-action="nav" data-page="articulos" role="button" tabindex="0" style="cursor:pointer;background:#F2665E;color:#fff;padding:15px 30px;border-radius:6px;font-size:15px">Ver artículos</span>
          <span data-action="nav" data-page="sobre" role="button" tabindex="0" style="cursor:pointer;border:1px solid rgba(255,255,255,.35);padding:15px 26px;border-radius:6px;font-size:15px">Sobre mí</span>
        </div>
      </div>
      <div style="justify-self:center;position:relative;width:400px;max-width:100%;aspect-ratio:1;display:grid;place-items:center">
        <div style="position:absolute;inset:0;border-radius:50%;background-color:#FFFFFFEB;width:403px;height:406px"></div>
        <img src="${ROOT_PREFIX}/assets/logo.png" alt="BlueBioBites" width="619" height="695" style="position:relative;width:78%;height:auto;display:block">
      </div>
    </div>
  </div>

  <div class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:66px;padding-bottom:0">
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:22px">
      <h2 style="margin:0;font-size:15px;letter-spacing:.16em;font-weight:500;color:#17A398">últimos artículos</h2>
      <span data-action="nav" data-page="articulos" role="button" tabindex="0" style="cursor:pointer;font-size:14px;color:#0B3D57">Ver todos →</span>
    </div>
    <div class="bbb-feat" style="display:grid;gap:26px">
      <div data-action="open-article" data-slug="${esc(featured.slug)}" role="button" tabindex="0" style="cursor:pointer;border:2px solid #12293A;border-radius:16px;overflow:hidden">
        <div style="height:280px;background:repeating-linear-gradient(135deg,${featured.tintA} 0 12px,${featured.tintB} 12px 24px);display:grid;place-items:center"><span style="font:11px ui-monospace,Menlo,monospace;color:${featured.accent}">imagen destacada · 3:2</span></div>
        <div style="padding:22px 26px 26px">
          <div style="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 12px 5px 5px;font-size:12.5px;background:${featured.bgLight};color:${featured.dark}"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:${featured.accent}">${featured.emoji}</span>${esc(featured.catName)}</div>
          <h3 style="margin:14px 0 10px;font-size:33px;line-height:1.13;letter-spacing:-.025em;font-weight:500;color:#12293A;text-wrap:balance">${esc(featured.title)}</h3>
          <p style="margin:0;font-size:16px;line-height:1.6;color:#12293A;opacity:.72">${esc(featured.excerpt)}</p>
          <div style="margin-top:16px;font-size:13px;color:#12293A;opacity:.5">${esc(featured.date)} · ${esc(featured.typeLabel)} · ${esc(featured.read)} de lectura</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:22px">
        ${secondary.map(a => `
        <div data-action="open-article" data-slug="${esc(a.slug)}" role="button" tabindex="0" style="cursor:pointer;border:1px solid #e2ddd2;border-radius:14px;overflow:hidden;display:flex">
          <div style="flex:none;width:108px;background:repeating-linear-gradient(135deg,${a.tintA} 0 10px,${a.tintB} 10px 20px)"></div>
          <div style="padding:15px 17px">
            <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px;color:${a.dark}"><span style="width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:10px;background:${a.accent}">${a.emoji}</span>${esc(a.catShort)}</div>
            <h3 style="margin:0 0 5px;font-size:17px;line-height:1.25;font-weight:500;color:#12293A">${esc(a.title)}</h3>
            <div style="font-size:12.5px;color:#12293A;opacity:.5">${esc(a.date)} · ${esc(a.typeLabel)}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </div>

<div class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:36px;padding-bottom:60px"><div style="display:flex;align-items:center;gap:28px;flex-wrap:wrap;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,#0B3D57,#17A398);padding:32px 36px;color:#fff"><div style="flex:1;min-width:240px"><div style="font-size:12px;letter-spacing:.14em;opacity:.85;margin-bottom:8px">SÍGUENOS</div><h3 style="margin:0 0 6px;font-size:22px;font-weight:500">📸 @bluebiobites en Instagram</h3><p style="margin:0;font-size:15px;line-height:1.5;opacity:.85;max-width:52ch">Curiosidades marinas en formato visual, carretes y contenido extra que no llega al blog.</p></div><a href="https://www.instagram.com/bluebiobites" target="_blank" rel="noopener" style="background:#fff;color:#0B3D57;padding:13px 28px;border-radius:6px;font-size:15px;font-weight:500;text-decoration:none;white-space:nowrap">Ver perfil</a></div></div>
<div class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:54px;padding-bottom:60px">
    <div class="bbb-row" style="display:flex;border-radius:14px;overflow:hidden;border:1px solid #0B3D57">
      <div style="flex:none;width:140px;background:#0B3D57;color:#fff;display:grid;place-content:center;text-align:center;padding:26px 0">
        <div style="font-size:44px;line-height:1">${esc(nextEvent.day)}</div><div style="font-size:13px;letter-spacing:.16em;opacity:.8">${esc(nextEvent.month)} ${esc(nextEvent.year)}</div>
      </div>
      <div style="flex:1;padding:26px 30px;background:#F7F1E3">
        <div style="font-size:12px;letter-spacing:.14em;color:#17A398;margin-bottom:8px">Próximo evento · ${esc(nextEvent.type)}</div>
        <div style="font-size:24px;color:#12293A;letter-spacing:-.015em">${esc(nextEvent.title)}</div>
        <div style="font-size:14.5px;color:#12293A;opacity:.65;margin-top:6px">${esc(nextEvent.place)} · ${esc(nextEvent.time)}</div>
      </div>
      <div style="flex:none;display:grid;place-items:center;padding:22px 30px;background:#F7F1E3"><span data-action="nav" data-page="agenda" role="button" tabindex="0" style="cursor:pointer;background:#F2665E;color:#fff;padding:13px 24px;border-radius:6px;font-size:14.5px;white-space:nowrap">Ver agenda</span></div>
    </div>
  </div>

  <div style="background:#F7F1E3">
    <div class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:58px;padding-bottom:64px">
      <h2 style="margin:0 0 6px;font-size:15px;letter-spacing:.16em;font-weight:500;color:#17A398">comentarios</h2>
      <p style="margin:0 0 24px;font-size:16px;color:#12293A;opacity:.7">El buzón general del blog: dudas, correcciones y temas que te gustaría leer.</p>
      ${renderComments('general')}
    </div>
  </div>
</main>`;
  }

  function renderSobre() {
    return `
<main class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:64px;padding-bottom:80px">
  <div style="display:flex;flex-direction:column;align-items:center;text-align:center">
    <div style="width:190px;height:190px;border-radius:50%;overflow:hidden;border:3px solid #17A398"><img src="${ROOT_PREFIX}/assets/foto.png" alt="Alejandro Galán" width="400" height="400" style="width:100%;height:100%;object-fit:cover;display:block"></div>
    <h1 style="margin:26px 0 0;font-size:44px;font-weight:500;letter-spacing:-.03em;color:#0B3D57">Alejandro Galán Galián</h1>
    <p style="margin:10px 0 0;font-size:17px;color:#12293A;opacity:.7">Ciencias del Mar · Biotecnología para la Salud y la Sostenibilidad</p>
    <div style="display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;justify-content:center">
      <span style="border:1px solid #cfe9e5;background:#E1F5EE;color:#085041;border-radius:999px;padding:8px 16px;font-size:13.5px">Grado en Ciencias del Mar</span>
      <span style="border:1px solid #f6d5d1;background:#FCEBE9;color:#7A2E28;border-radius:999px;padding:8px 16px;font-size:13.5px">Máster en Biotecnología</span>
    </div>
  </div>
  <div style="max-width:66ch;margin:48px auto 0;display:flex;flex-direction:column;gap:22px">
    ${BIO.map(t => `<p style="margin:0;font-size:17.5px;line-height:1.75;color:#12293A;opacity:.88;text-align:justify;text-wrap:pretty">${esc(t)}</p>`).join('')}
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-self:flex-start;margin-top:14px"><a href="mailto:bluebiobites@gmail.com" style="background:#F2665E;color:#fff;padding:14px 30px;border-radius:6px;font-size:15px;text-decoration:none">Escríbeme</a><a href="${ROOT_PREFIX}/assets/CV_Alejandro_Galan_Galian.pdf" download style="border:1.5px solid #17A398;color:#17A398;padding:12.5px 28px;border-radius:6px;font-size:15px;text-decoration:none;background:#fff">Descargar CV</a><a href="https://www.linkedin.com/in/alejandrogalangalian" target="_blank" rel="noopener" style="border:1.5px solid #0B3D57;color:#0B3D57;padding:12.5px 28px;border-radius:6px;font-size:15px;text-decoration:none;background:#fff">LinkedIn</a></div>
  </div>
</main>`;
  }

  function renderArticulos() {
    const list = filteredArticles();
    const totalPages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    const pageNum = Math.min(state.pageNum, totalPages);
    const pageItems = list.slice((pageNum - 1) * PER_PAGE, pageNum * PER_PAGE).map(deco);
    const resultLabel = list.length === ARTICLES.length
      ? ARTICLES.length + ' artículos publicados'
      : list.length + ' de ' + ARTICLES.length + ' artículos';
    const noResults = list.length === 0;

    const catRows = Object.keys(CATS).map(id => {
      const on = state.cats.indexOf(id) !== -1;
      const c = CATS[id];
      return `
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 8px;border-radius:9px;font-size:13.5px;line-height:1.25;background:${on ? c.bgLight : 'transparent'};color:${on ? c.dark : '#12293A'}">
        <input type="checkbox" ${on ? 'checked' : ''} data-cat-toggle="${id}" style="accent-color:${c.accent};width:15px;height:15px;flex:none">
        <span style="width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:12px;background:${c.accent}">${c.emoji}</span>
        ${esc(c.name)}
      </label>`;
    }).join('');

    const typeRows = Object.keys(TYPES).map(id => {
      const on = state.types.indexOf(id) !== -1;
      const t = TYPES[id];
      return `
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 8px;border-radius:9px;font-size:13.5px;line-height:1.25;background:${on ? t.bgLight : 'transparent'};color:${on ? t.dark : '#12293A'}">
        <input type="checkbox" ${on ? 'checked' : ''} data-type-toggle="${id}" style="accent-color:${t.accent};width:15px;height:15px;flex:none">
        <span style="width:24px;height:24px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:12px;background:${t.accent}">${t.emoji}</span>
        ${esc(t.label)}s
      </label>`;
    }).join('');

    const pages = Array.from({length: totalPages}, (_, i) => i + 1);

    return `
<main class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:52px;padding-bottom:76px">
  <h1 style="margin:0 0 6px;font-size:44px;font-weight:500;letter-spacing:-.03em;color:#0B3D57">Artículos</h1>
  <p style="margin:0 0 32px;font-size:16.5px;color:#12293A;opacity:.7">${esc(resultLabel)}</p>
  <div class="bbb-arts" style="display:grid;gap:40px;align-items:start">
    <aside class="bbb-side" style="top:96px;border:1px solid #e2ddd2;border-radius:14px;padding:20px;background:#fff">
      <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px">
        <span style="font-size:12px;letter-spacing:.16em;color:#17A398">Categorías</span>
        <span data-action="clear-filters" role="button" tabindex="0" style="cursor:pointer;font-size:12.5px;color:#0B3D57;opacity:.7">Limpiar filtros</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">${catRows}</div>
      <div style="font-size:12px;letter-spacing:.16em;color:#17A398;margin:22px 0 14px">Tipo de contenido</div>
      <div style="display:flex;flex-direction:column;gap:3px">${typeRows}</div>
    </aside>
    <div>
      <div class="bbb-list" style="display:grid;gap:26px">
        ${pageItems.map(a => `
        <div data-action="open-article" data-slug="${esc(a.slug)}" role="button" tabindex="0" style="cursor:pointer;border:1px solid #e2ddd2;border-radius:14px;overflow:hidden;background:#fff;display:flex;flex-direction:column">
          <div style="height:168px;background:repeating-linear-gradient(135deg,${a.tintA} 0 12px,${a.tintB} 12px 24px);display:grid;place-items:center"><span style="font:11px ui-monospace,Menlo,monospace;color:${a.accent}">imagen destacada</span></div>
          <div style="padding:18px 20px 20px;display:flex;flex-direction:column;gap:10px;flex:1">
            <div style="display:inline-flex;align-self:flex-start;align-items:center;gap:7px;border-radius:999px;padding:5px 12px 5px 5px;font-size:12px;background:${a.bgLight};color:${a.dark}"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:11px;background:${a.accent}">${a.emoji}</span>${esc(a.catName)}</div>
            <h3 style="margin:0;font-size:20px;line-height:1.24;font-weight:500;color:#12293A">${esc(a.title)}</h3>
            <p style="margin:0;font-size:14px;line-height:1.55;color:#12293A;opacity:.7;flex:1">${esc(a.excerpt)}</p>
            <div style="font-size:12.5px;color:#12293A;opacity:.5">${esc(a.date)} · ${esc(a.typeLabel)} · ${esc(a.read)}</div>
          </div>
        </div>`).join('')}
      </div>
      ${noResults ? `<div style="border:1px dashed #cfc8b8;border-radius:14px;padding:44px;text-align:center;color:#12293A;opacity:.6;font-size:15.5px">Ningún artículo coincide con los filtros. <span data-action="clear-filters" role="button" tabindex="0" style="cursor:pointer;color:#17A398">Limpiar filtros</span></div>` : ''}
      <div style="display:flex;gap:8px;justify-content:center;margin-top:38px">
        ${pages.map(n => `<span data-action="go-page" data-page-num="${n}" role="button" tabindex="0" style="cursor:pointer;min-width:40px;text-align:center;padding:10px 12px;border-radius:9px;font-size:14px;border:1px solid ${n === pageNum ? '#0B3D57' : '#e2ddd2'};background:${n === pageNum ? '#0B3D57' : '#fff'};color:${n === pageNum ? '#fff' : '#12293A'}">${n}</span>`).join('')}
      </div>
    </div>
  </div>
</main>`;
  }

  function renderArticulo() {
    const art = deco(currentArticle());
    const related = ARTICLES.filter(a => a.slug !== art.slug)
      .sort((a, b) => (b.cat === art.cat ? 1 : 0) - (a.cat === art.cat ? 1 : 0))
      .slice(0, 3).map(deco);

    return `
<main class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:36px;padding-bottom:80px">
  <span data-action="nav" data-page="articulos" role="button" tabindex="0" style="cursor:pointer;font-size:14px;color:#0B3D57;opacity:.7">← Todos los artículos</span>
  <article style="max-width:72ch;margin:26px auto 0">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <span style="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 13px 5px 5px;font-size:12.5px;background:${art.bgLight};color:${art.dark}"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:${art.accent}">${art.emoji}</span>${esc(art.catName)}</span>
      <span style="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 13px 5px 5px;font-size:12.5px;background:${art.typeBgLight};color:${art.typeDark}"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:${art.typeAccent}">${art.typeEmoji}</span>${esc(art.typeLabel)}</span>
      <span style="font-size:13.5px;color:#12293A;opacity:.55">${esc(art.date)} · ${esc(art.read)} de lectura</span>
    </div>
    <h1 style="margin:20px 0 0;font-size:46px;line-height:1.08;letter-spacing:-.03em;font-weight:500;color:#0B3D57;text-wrap:balance">${esc(art.title)}</h1>
    <div style="margin-top:16px;display:flex;align-items:center;gap:11px">
      <span style="width:34px;height:34px;border-radius:50%;overflow:hidden;display:block"><img src="${ROOT_PREFIX}/assets/foto.png" alt="" width="400" height="400" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block"></span>
      <span style="font-size:14.5px;color:#12293A;opacity:.75">Por Alejandro Galán</span>
    </div>
    <div style="margin-top:30px;height:340px;border-radius:14px;background:repeating-linear-gradient(135deg,${art.tintA} 0 14px,${art.tintB} 14px 28px);display:grid;place-items:center"><span style="font:11px ui-monospace,Menlo,monospace;color:${art.accent}">imagen destacada</span></div>

    <div style="margin-top:32px;border:2px solid ${art.accent};border-radius:14px;padding:24px 26px;background:${art.bgLight}">
      <div style="font-size:12px;letter-spacing:.16em;margin-bottom:14px;color:${art.dark}">en bocados</div>
      <div style="display:flex;flex-direction:column;gap:12px">
        ${art.bites.map(t => `<div style="display:flex;gap:12px;align-items:flex-start"><span style="flex:none;width:8px;height:8px;border-radius:50%;margin-top:8px;background:${art.accent}"></span><span style="font-size:16px;line-height:1.55;color:${art.dark}">${esc(t)}</span></div>`).join('')}
      </div>
    </div>

    <div style="margin-top:34px;display:flex;flex-direction:column;gap:22px">
      ${art.body.map(t => `<p style="margin:0;font-size:18px;line-height:1.75;color:#12293A;opacity:.9;text-wrap:pretty">${esc(t)}</p>`).join('')}
    </div>

    <div style="margin-top:38px;border:1px solid #e2ddd2;border-left:4px solid #0B3D57;border-radius:10px;padding:20px 24px;background:#F7F1E3">
      <div style="font-size:12px;letter-spacing:.16em;color:#17A398;margin-bottom:10px">${Array.isArray(art.ref) && art.ref.length > 1 ? 'referencias' : 'referencia'}</div>
      ${Array.isArray(art.ref)
        ? `<div style="display:flex;flex-direction:column;gap:12px">${art.ref.map((r, i) => `<p style="margin:0;font-size:15px;line-height:1.65;color:#12293A;opacity:.85">${art.ref.length > 1 ? `<span style="opacity:.55">${i + 1}. </span>` : ''}${esc(r)}</p>`).join('')}</div>`
        : `<p style="margin:0;font-size:15px;line-height:1.65;color:#12293A;opacity:.85">${esc(art.ref)}</p>`}
    </div>

    <div style="margin-top:44px">
      <h2 style="margin:0 0 6px;font-size:15px;letter-spacing:.16em;font-weight:500;color:#17A398">comentarios</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#12293A;opacity:.65">¿Dudas o correcciones sobre este artículo?</p>
      ${renderComments(art.slug)}
    </div>
  </article>

  <div style="max-width:1180px;margin:56px auto 0;border-top:1px solid #e2ddd2;padding-top:32px">
    <h2 style="margin:0 0 20px;font-size:15px;letter-spacing:.16em;font-weight:500;color:#17A398">artículos relacionados</h2>
    <div class="bbb-3col bbb-3col-related" style="display:grid;gap:24px">
      ${related.map(a => `
      <div data-action="open-article" data-slug="${esc(a.slug)}" role="button" tabindex="0" style="cursor:pointer;border:1px solid #e2ddd2;border-radius:14px;overflow:hidden">
        <div style="height:110px;background:repeating-linear-gradient(135deg,${a.tintA} 0 10px,${a.tintB} 10px 20px)"></div>
        <div style="padding:15px 17px 17px">
          <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;margin-bottom:7px;color:${a.dark}"><span style="width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:10px;background:${a.accent}">${a.emoji}</span>${esc(a.catShort)}</div>
          <h3 style="margin:0 0 6px;font-size:16.5px;line-height:1.28;font-weight:500;color:#12293A">${esc(a.title)}</h3>
          <div style="font-size:12.5px;color:#12293A;opacity:.5">${esc(a.date)} · ${esc(a.typeLabel)}</div>
        </div>
      </div>`).join('')}
    </div>
  </div>
</main>`;
  }

  function renderAgenda() {
    const AGENDA_TYPES = {Congreso:{accent:'#0B3D57',bgLight:'#E7EEF3',dark:'#0B3D57',label:'Congresos'},Taller:{accent:'#17A398',bgLight:'#E1F5EE',dark:'#0B5B52',label:'Talleres y cursos'},Webinar:{accent:'#F2665E',bgLight:'#FCEBE9',dark:'#7A2E28',label:'Webinars'},Convocatoria:{accent:'#7B5EA7',bgLight:'#EDE7F5',dark:'#4A3766',label:'Convocatorias'}}; const activeType = state.agendaType; const upcoming = EVENTS.filter(e => e.upcoming);
    const past = EVENTS.filter(e => !e.upcoming); const upcomingShown = activeType ? upcoming.filter(e => e.type === activeType) : upcoming; const pastShown = activeType ? past.filter(e => e.type === activeType) : past; const tiles = Object.keys(AGENDA_TYPES).map(function(type) { var t = AGENDA_TYPES[type]; var count = EVENTS.filter(function(ev){return ev.type === type;}).length; var on = activeType === type; return '<div data-action="agenda-filter" data-type="' + type + '" role="button" tabindex="0" class="bbb-agenda-tile' + (on ? ' is-active' : '') + '" style="background:' + (on ? t.accent : t.bgLight) + ';color:' + (on ? '#fff' : t.dark) + '"><div style="font-weight:500;font-size:16px">' + t.label + '</div><div style="font-size:12.5px;opacity:.8;margin-top:4px">' + count + ' evento' + (count === 1 ? '' : 's') + '</div></div>'; }).join(''); const agendaView = state.agendaView || 'list'; const mapEvents = EVENTS.filter(function(e){ return e.lat != null && (!activeType || e.type === activeType); }); const onlineCount = (activeType ? EVENTS.filter(function(e){ return e.type === activeType; }).length : EVENTS.length) - mapEvents.length; const viewToggle = '<div class="bbb-agenda-viewtoggle" style="margin:4px 0 28px">' + '<button type="button" data-action="agenda-view" data-view="list" class="' + (agendaView === 'list' ? 'is-active' : '') + '">Lista</button>' + '<button type="button" data-action="agenda-view" data-view="map" class="' + (agendaView === 'map' ? 'is-active' : '') + '">Mapa</button>' + '</div>'; const mapBlock = '<div id="bbb-agenda-map" class="bbb-agenda-map"></div><p style="margin:14px 0 0;font-size:13px;color:#12293A;opacity:.6">' + (onlineCount ? 'Mostrando ' + mapEvents.length + ' eventos presenciales en el mapa. ' + onlineCount + (onlineCount === 1 ? ' evento online no aparece' : ' eventos online no aparecen') + ' (consulta la lista).' : 'Mostrando ' + mapEvents.length + ' eventos presenciales en el mapa.') + '</p>';

    const row = (e, isUpcoming) => `
    <div class="bbb-row bbb-row-center" style="display:flex;gap:24px;border:1px solid ${isUpcoming ? '#e2ddd2' : '#ece8df'};border-radius:14px;padding:20px 24px${isUpcoming ? '' : ';background:#faf8f3'}">
      <div style="flex:none;width:78px;height:82px;border-radius:12px;background:${isUpcoming ? '#0B3D57' : '#e6e1d5'};color:${isUpcoming ? '#fff' : '#12293A'};display:grid;place-content:center;text-align:center;line-height:1.05${isUpcoming ? '' : ';opacity:.8'}"><div style="font-size:30px">${esc(e.day)}</div><div style="font-size:12px;letter-spacing:.1em${isUpcoming ? ';opacity:.85' : ''}">${esc(e.month)}</div></div>
      <div style="flex:1${isUpcoming ? '' : ';opacity:.72'}">
        <div style="font-size:12px;letter-spacing:.14em;color:${isUpcoming ? '#17A398' : '#12293A'}${isUpcoming ? '' : ';opacity:.6'};margin-bottom:6px">${esc(e.type)}</div>
        <div style="font-size:21px;color:#12293A;letter-spacing:-.015em">${esc(e.title)}</div>
        <div style="font-size:14px;color:#12293A;opacity:${isUpcoming ? '.65' : '.7'};margin-top:5px">${esc(e.place)} · ${esc(e.org)}</div>
      </div>
      ${isUpcoming
        ? `<a href="${esc(e.url)}" style="flex:none;background:#F2665E;color:#fff;padding:13px 26px;border-radius:6px;font-size:14.5px;text-decoration:none;white-space:nowrap">Inscribirse</a>`
        : `<span style="flex:none;border:1px solid #d9d3c4;color:#12293A;opacity:.6;padding:11px 22px;border-radius:6px;font-size:14px;white-space:nowrap">Finalizado</span>`}
    </div>`;

    return `
<main class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:52px;padding-bottom:80px">
  <h1 style="margin:0 0 6px;font-size:44px;font-weight:500;letter-spacing:-.03em;color:#0B3D57">Agenda</h1>
  <p style="margin:0 0 40px;font-size:16.5px;color:#12293A;opacity:.7;max-width:60ch">Congresos, talleres, webinars y convocatorias de biología marina, microbiología marina y biotecnología azul, con foco en España y Europa.</p>
<div class="bbb-agenda-tiles" style="margin:8px 0 36px">${tiles}</div>${activeType ? '<div style="margin:-20px 0 32px"><span data-action="agenda-clear" role="button" tabindex="0" style="cursor:pointer;font-size:13.5px;color:#F2665E;text-decoration:underline">← Ver todos los eventos</span></div>' : ''}
  ${viewToggle}${agendaView === 'map' ? mapBlock : '<h2 style="margin:0 0 18px;font-size:15px;letter-spacing:.16em;font-weight:500;color:#17A398">próximos</h2>'}
  ${agendaView === 'map' ? '' : '<div style="display:flex;flex-direction:column;gap:16px">' + upcomingShown.map(function(e){ return row(e, true); }).join('') + '</div>'}

  ${agendaView === 'map' ? '' : '<div style="height:1px;background:#d9d3c4;margin:52px 0 40px"></div>'}

  ${agendaView === 'map' ? '' : '<h2 style="margin:0 0 18px;font-size:15px;letter-spacing:.16em;font-weight:500;color:#12293A;opacity:.5">pasados</h2>'}
  ${agendaView === 'map' ? '' : '<div style="display:flex;flex-direction:column;gap:16px">' + pastShown.map(function(e){ return row(e, false); }).join('') + '</div>'}
</main>`;
  }

      function initAgendaMap() {
              var el = document.getElementById('bbb-agenda-map');
              if (!el || typeof L === 'undefined') return;
              var colors = { Congreso: '#0B3D57', Taller: '#17A398', Webinar: '#F2665E', Convocatoria: '#7B5EA7' };
              var activeType = state.agendaType;
              var pts = EVENTS.filter(function(e){ return e.lat != null && (!activeType || e.type === activeType); });
              var map = L.map(el).setView([48, 6], 4);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(map);
              var group = [];
              pts.forEach(function(e) {
                        var marker = L.circleMarker([e.lat, e.lng], { radius: 9, color: '#fff', weight: 2, fillColor: colors[e.type] || '#0B3D57', fillOpacity: 1 }).addTo(map);
                        marker.bindPopup('<strong>' + esc(e.title) + '</strong><br>' + esc(e.day) + ' ' + esc(e.month) + ' ' + esc(e.year) + ' &middot; ' + esc(e.place) + '<br><a href="' + esc(e.url) + '" target="_blank" rel="noopener">Más info</a>');
                        group.push(marker);
              });
              if (group.length) {
                        var fg = L.featureGroup(group);
                        map.fitBounds(fg.getBounds().pad(0.3));
              }
      }

  function renderGlosario() {
    const items = GLOSARIO.slice().sort((a,b) => a.termino.localeCompare(b.termino, 'es'));
    return `
      <main class="bbb-pad" style="max-width:1180px;margin:0 auto;padding-top:64px;padding-bottom:80px">
        <div style="font-size:12px;letter-spacing:.2em;color:#17A398;margin-bottom:8px">glosario</div>
        <h1 class="bbb-h1" style="margin:0 0 12px;font-size:38px;line-height:1.12;letter-spacing:-.03em;font-weight:500;color:#0B3D57">La palabra del día, coleccionada</h1>
        <p style="margin:0 0 40px;max-width:62ch;font-size:17px;line-height:1.6;opacity:.78">Términos de biología y biotecnología marina explicados sin jerga, con una ilustración y una referencia científica cada uno.</p>
        ${items.length ? items.map(t => {
          const c = CATS[t.cat] || CATS.bio;
          return `
            <article style="display:grid;grid-template-columns:220px 1fr;gap:28px;align-items:start;border:1px solid #e2ddd2;border-radius:14px;padding:26px;margin-bottom:22px;background:#fff">
              <div style="width:100%;height:220px;border-radius:10px;overflow:hidden;background:${c.bgLight};flex:none">
                <img src="${ROOT_PREFIX}/${esc(t.imagen)}" alt="${esc(t.imagen_alt || t.termino)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">
              </div>
              <div>
                <span style="display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:5px 13px 5px 5px;font-size:12.5px;background:${c.bgLight};color:${c.dark}"><span style="width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:${c.accent}">${c.emoji}</span>${esc(c.name)}</span>
                <h2 style="margin:14px 0 10px;font-size:26px;font-weight:500;color:#0B3D57;letter-spacing:-.02em">${esc(t.termino)}</h2>
                <p style="margin:0;font-size:16px;line-height:1.7;color:#12293A;opacity:.88">${esc(t.definicion)}</p>
                ${t.dato ? `<div style="margin-top:16px;border-left:3px solid ${c.accent};padding:10px 16px;background:${c.bgLight};border-radius:0 8px 8px 0"><div style="font-size:11px;letter-spacing:.14em;color:${c.dark};margin-bottom:4px">dato curioso</div><p style="margin:0;font-size:14.5px;line-height:1.55;color:#12293A;opacity:.85">${esc(t.dato)}</p></div>` : ''}
                ${t.referencia ? `<p style="margin:16px 0 0;font-size:12.5px;line-height:1.5;color:#12293A;opacity:.55">${esc(t.referencia)}</p>` : ''}
              </div>
            </article>`;
        }).join('') : `<p style="opacity:.6">Todavía no hay palabras en el glosario — vuelve pronto.</p>`}
      </main>`;
  }

  function renderMain() {
    switch (state.page) {
      case 'sobre': return renderSobre();
      case 'articulos': return renderArticulos();
      case 'articulo': return renderArticulo();
      case 'agenda': return renderAgenda();
      case 'glosario': return renderGlosario();
      default: return renderInicio();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Render root + focus preservation                                 */
  /* ---------------------------------------------------------------- */

  function render() {
    document.title = pageTitle();
    setMeta('description', pageDescription());
    setMeta('og:title', pageTitle());
    setMeta('og:description', pageDescription());
    setMeta('twitter:title', pageTitle());
    setMeta('twitter:description', pageDescription());
    const root = document.getElementById('app');
    root.innerHTML = renderHeader() + renderMain() + renderFooter(); initAgendaMap();
  }

  function renderPreserveFocus() {
    const active = document.activeElement;
    let bind = null, selStart = null, selEnd = null;
    if (active && active.dataset && active.dataset.bind) {
      bind = active.dataset.bind;
      selStart = active.selectionStart;
      selEnd = active.selectionEnd;
    }
    render();
    if (bind) {
      // Some binds (e.g. the header search box) render twice — once for
      // desktop, once for the mobile full-width row — with only one shown
      // per breakpoint via CSS. Prefer whichever copy is actually visible.
      const candidates = Array.from(document.querySelectorAll('[data-bind="' + bind + '"]'));
      const el = candidates.find(c => c.offsetParent !== null) || candidates[0];
      if (el) {
        el.focus();
        if (selStart != null && el.setSelectionRange) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) { /* ignore */ }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */


  /* ---------------------------------------------------------------- */
  /* Event delegation                                                  */
  /* ---------------------------------------------------------------- */

  function onClick(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'agenda-view') { state.agendaView = el.dataset.view; render(); return; } if (action === 'agenda-filter') { state.agendaType = (state.agendaType === el.dataset.type ? null : el.dataset.type); render(); return; } if (action === 'agenda-clear') { state.agendaType = null; render(); return; } if (action === 'nav') { go(el.dataset.page); return; }
    if (action === 'open-article') { go('articulo', {slug: el.dataset.slug}); return; }
    if (action === 'toggle-search') { state.searchOpen = !state.searchOpen; render(); return; }
    if (action === 'toggle-menu') { state.menuOpen = !state.menuOpen; render(); return; }
    if (action === 'clear-filters') { state.cats = []; state.types = []; state.query = ''; state.pageNum = 1; render(); return; }
    if (action === 'go-page') { state.pageNum = Number(el.dataset.pageNum); window.scrollTo(0, 0); render(); return; }
    if (action === 'submit-comment') { submitComment(); return; }
    if (action === 'reply-to') { state.replyingTo = el.dataset.commentId; render(); return; }
    if (action === 'cancel-reply') { state.replyingTo = null; render(); return; }
  }

  // The newsletter form posts for real to Buttondown, targeting a hidden
  // iframe so the visitor never leaves the page. We can't read the
  // cross-origin response, so "load" on that iframe is our only success
  // signal; awaitingNewsletterResponse gates against the iframe's own
  // initial about:blank load firing that same event.
  let awaitingNewsletterResponse = false;

  function onSubmit(e) {
    const form = e.target.closest('[data-newsletter-form]');
    if (!form) return;
    if ((state.email || '').trim().indexOf('@') <= 0) {
      e.preventDefault();
      return;
    }
    awaitingNewsletterResponse = true;
  }

  function onNewsletterFrameLoad() {
    if (!awaitingNewsletterResponse) return;
    awaitingNewsletterResponse = false;
    state.subscribed = true;
    render();
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[role="button"]');
    if (!el) return;
    if (e.target.tagName === 'INPUT') return;
    e.preventDefault();
    el.click();
  }

  function onInput(e) {
    const el = e.target;
    const bind = el.dataset.bind;
    if (!bind) return;
    if (bind === 'query') {
      state.query = el.value;
      state.page = 'articulos';
      state.pageNum = 1;
      syncHash();
      renderPreserveFocus();
    } else if (bind === 'draft') {
      state.draft = el.value;
      state.commentSent = false;
    } else if (bind === 'commentName') {
      state.commentName = el.value;
      state.commentSent = false;
    } else if (bind === 'commentEmail') {
      state.commentEmail = el.value;
      state.commentSent = false;
    } else if (bind === 'email') {
      state.email = el.value;
    }
  }

  function onChange(e) {
    const el = e.target;
    const catId = el.dataset.catToggle;
    const typeId = el.dataset.typeToggle;
    if (catId) {
      const idx = state.cats.indexOf(catId);
      if (idx === -1) state.cats.push(catId); else state.cats.splice(idx, 1);
      state.pageNum = 1;
      render();
    } else if (typeId) {
      const idx = state.types.indexOf(typeId);
      if (idx === -1) state.types.push(typeId); else state.types.splice(idx, 1);
      state.pageNum = 1;
      render();
    }
  }

  function onHashChange() {
    if (suppressHashHandling) { suppressHashHandling = false; return; }
    const {page, slug} = parseHash();
    Object.assign(state, {page, slug, menuOpen: false});
    render();
  }

  /* ---------------------------------------------------------------- */
  /* Bootstrap                                                         */
  /* ---------------------------------------------------------------- */

  async function loadContent() {
    const [articulosRes, bioRes, agendaRes] = await Promise.all([
      fetch(ROOT_PREFIX + '/content/articulos.json'),
      fetch(ROOT_PREFIX + '/content/sobre-mi.json'),
      fetch(ROOT_PREFIX + '/content/agenda.json')
    ]);
    const [articulosData, bioData, agendaData] = await Promise.all([
      articulosRes.json(), bioRes.json(), agendaRes.json()
    ]);
    ARTICLES = articulosData.articulos;
    BIO = bioData.parrafos;
    EVENTS = agendaData.eventos;
  }

  async function init() {
    const root = document.getElementById('app');
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', onKeydown);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', onSubmit);
    window.addEventListener('hashchange', onHashChange);

    const frame = document.getElementById('bbb-subscribe-frame');
    if (frame) frame.addEventListener('load', onNewsletterFrameLoad);

    // Pre-rendered pages (e.g. articulo/<slug>/index.html) already have real
    // static content in #app for SEO/no-JS visitors — don't flash a loading
    // placeholder over it while we fetch the same data to hydrate in place.
    if (!root.innerHTML.trim()) {
      root.innerHTML = '<div style="padding:100px 20px;text-align:center;color:#0B3D57;font-family:sans-serif">Cargando…</div>';
    }

    try {
      await loadContent();
    } catch (err) {
      root.innerHTML = '<div style="padding:100px 20px;text-align:center;color:#F2665E;font-family:sans-serif">No se ha podido cargar el contenido. Recarga la página.</div>';
      return;
    }

    try {
      await fetchComments();
    } catch (err) {
      console.error('No se han podido cargar los comentarios:', err);
      // No bloqueamos el resto de la web si los comentarios fallan
    }

    let initial = parseHash();
    // No hash yet: this may be a direct visit to a pre-rendered article URL
    // (articulo/<slug>/) coming from search results or a shared link.
    if (initial.page === 'inicio' && !location.hash) {
      const slug = parsePathnameArticleSlug();
      if (slug && ARTICLES.some(a => a.slug === slug)) {
        initial = {page: 'articulo', slug};
      }
    }
    Object.assign(state, initial);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
