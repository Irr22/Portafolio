// ============================================================
//  CONFIGURACIÓN
// ============================================================
const CONFIG = {
  DATOS_URL:  "./datos.json",
  UI_URL:     "./i18n-ui.json",
  APIS_URL:   "./apis.json",
  SHEETY_URL: "",
  TIMELINE_POR_PAGINA: 8,
};
let DEVLOGS_GRUPOS_POR_PAGINA = 3;

// ============================================================
//  SISTEMA DE IMÁGENES CON FALLBACK SEGURO
// ============================================================
function imgSrc(img) {
  if (!img) return "";
  if (typeof img === "string") return img;
  return img.src || img.fallback || "";
}
function imgFallback(img) {
  if (!img || typeof img === "string") return "";
  return img.fallback || "";
}
function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function imgTag(img, alt = "", extraAttrs = "") {
  const src = imgSrc(img);
  const fb  = imgFallback(img);
  const fallbackAttr = fb ? `data-fallback="${escapeAttr(fb)}" onerror="window.__imgFallback(this)"` : "";
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" ${fallbackAttr} ${extraAttrs} />`;
}
window.__imgFallback = function (el) {
  const fb = el.dataset.fallback;
  if (!fb) { el.onerror = null; return; }
  el.onerror = null;
  el.src = fb;
  el.addEventListener("error", () => {
    el.style.background = "linear-gradient(135deg, #1a1a26, #22222f)";
    el.alt = "🖼";
  }, { once: true });
};

// ============================================================
//  SISTEMA i18n
// ============================================================
const I18N = {
  lang: localStorage.getItem("lang") || "es",
  ui: {},   // se rellena con i18n-ui.json
  t(obj) {
    if (obj == null) return "";
    if (typeof obj === "string") return obj;
    return obj[this.lang] ?? obj.es ?? obj.en ?? "";
  },
  set(lang) {
    if (!["es", "en"].includes(lang)) return;
    this.lang = lang;
    localStorage.setItem("lang", lang);
    document.documentElement.setAttribute("lang", lang);
    document.querySelectorAll("[data-lang-btn]").forEach((b) => {
      b.classList.toggle("active", b.dataset.langBtn === lang);
    });
  },
  resolvePath(path) {
    let node = this.ui;
    for (const p of path.split(".")) {
      node = node?.[p];
      if (node == null) return null;
    }
    return node;
  },
};
const t = (obj) => I18N.t(obj);

// ------------------------------------------------------------
//  Aplica data-i18n a nodos estáticos
// ------------------------------------------------------------
function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const node = I18N.resolvePath(el.dataset.i18n);
    if (node) el.textContent = t(node);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const node = I18N.resolvePath(el.dataset.i18nHtml);
    if (node) el.innerHTML = t(node);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const node = I18N.resolvePath(el.dataset.i18nAria);
    if (node) el.setAttribute("aria-label", t(node));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const node = I18N.resolvePath(el.dataset.i18nTitle);
    if (node) el.setAttribute("title", t(node));
  });
}

// ------------------------------------------------------------
//  Selector de idioma
// ------------------------------------------------------------
function initLangSelector() {
  const containers = document.querySelectorAll("[data-lang-selector]");
  if (!containers.length) return;
  containers.forEach((c) => {
    c.innerHTML = `
      <button data-lang-btn="es" class="${I18N.lang === "es" ? "active" : ""}">ES</button>
      <button data-lang-btn="en" class="${I18N.lang === "en" ? "active" : ""}">EN</button>`;
    c.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-lang-btn]");
      if (!btn) return;
      I18N.set(btn.dataset.langBtn);
      renderCurrentPage();
    });
  });
}

// ------------------------------------------------------------
//  Caption de galería con fallback "Imagen N"
// ------------------------------------------------------------
function captionGaleria(textoDefinido, index) {
  const txt = I18N.t(textoDefinido);
  if (txt && String(txt).trim() !== "") return txt;
  const n = index + 1;
  return I18N.lang === "en" ? `Image ${n}` : `Imagen ${n}`;
}

// ============================================================
//  CARGA DE CONFIGURACIÓN Y DATOS
// ============================================================
async function cargarConfig() {
  try {
    const res = await fetch(CONFIG.APIS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const api = await res.json();
    if (api.SHEETY_URL)                CONFIG.SHEETY_URL = String(api.SHEETY_URL).trim();
    if (api.DEVLOGS_GRUPOS_POR_PAGINA) DEVLOGS_GRUPOS_POR_PAGINA = Number(api.DEVLOGS_GRUPOS_POR_PAGINA);
  } catch (err) {
    console.warn("[Config] apis.json no disponible:", err.message);
  }
}

// ============================================================
//  CARGA DE DATOS (soporta modo monolítico y modo manifest)
// ============================================================
async function cargarDatos() {
  // 1) Cargar manifest (o el propio datos.json monolítico)
  const resManifest = await fetch(CONFIG.DATOS_URL);
  if (!resManifest.ok) throw new Error("No se pudo cargar datos.json");
  const manifest = await resManifest.json();

  // 2) Cargar i18n-ui.json en paralelo (da igual el modo)
  const uiPromise = fetch(CONFIG.UI_URL).then((r) => {
    if (!r.ok) throw new Error("No se pudo cargar i18n-ui.json");
    return r.json();
  });

  let datos;

  if (manifest._manifest && manifest.parts) {
    // === MODO FRAGMENTADO ===
    const keys = Object.keys(manifest.parts);
    const results = await Promise.all(
      keys.map(async (key) => {
        const url = manifest.parts[key];
        const r = await fetch(url);
        if (!r.ok) throw new Error(`No se pudo cargar ${url}`);
        return { key, data: await r.json() };
      })
    );
    datos = {};
    results.forEach(({ key, data }) => { datos[key] = data; });
  } else {
    // === MODO MONOLÍTICO (compatibilidad hacia atrás) ===
    datos = manifest;
  }

  // 3) Esperar al i18n-ui.json
  I18N.ui = await uiPromise;

  // 4) Procesar devblogs (Sheety + orden)
  let devblogs = [...(datos.devblogs || [])];
  if (CONFIG.SHEETY_URL) {
    try {
      const r = await fetch(CONFIG.SHEETY_URL);
      if (r.ok) {
        const n = await r.json();
        const nDev = n.devblogs || n[Object.keys(n)[0]] || [];
        const set = new Set(devblogs.map((d) => t(d.titulo) + d.idProyecto));
        const nuevos = nDev.filter((d) => !set.has(t(d.titulo) + d.idProyecto));
        if (nuevos.length > 0) devblogs = [...devblogs, ...nuevos];
      }
    } catch (err) { console.warn("[Sheety]", err.message); }
  }
  devblogs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  return {
    proyectos:       datos.proyectos || [],
    libros:          datos.libros || [],
    otros_proyectos: datos.otros_proyectos || [],
    trayectoria:     datos.trayectoria || [],
    devblogs,
    vlogs:           datos.vlogs || [],
  };
}

// ============================================================
//  UTILIDADES
// ============================================================
function formatearFecha(s) {
  if (!s) return "";
  const d = new Date(String(s).trim() + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(I18N.lang === "en" ? "en-GB" : "es-ES", {
    day: "numeric", month: "long", year: "numeric",
  });
}
function paginaActual() { return document.body.dataset.page || ""; }

// ============================================================
//  TEMA, NAVBAR, MODAL
// ============================================================
function initThemeToggle() {
  const toggle = document.getElementById("theme-toggle");
  const html = document.documentElement;
  const saved = localStorage.getItem("theme") || "dark";
  html.setAttribute("data-theme", saved);
  if (toggle) toggle.textContent = saved === "dark" ? "☀️" : "🌙";
  if (toggle) toggle.addEventListener("click", () => {
    const next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    html.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    toggle.textContent = next === "dark" ? "☀️" : "🌙";
  });
}
function initNavbar() {
  const nav = document.getElementById("navbar");
  const ham = document.getElementById("nav-hamburger");
  const links = document.getElementById("nav-links");
  window.addEventListener("scroll", () => { if (nav) nav.classList.toggle("scrolled", window.scrollY > 40); });
  if (ham && links) {
    ham.addEventListener("click", () => { ham.classList.toggle("open"); links.classList.toggle("open"); });
    links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
      ham.classList.remove("open"); links.classList.remove("open");
    }));
  }
}
window.cerrarModal = function () {
  const m = document.getElementById("game-modal");
  if (m) m.style.display = "none";
  document.body.style.overflow = "";
};
function initModalClose() {
  const m = document.getElementById("game-modal");
  if (m) m.addEventListener("click", (e) => { if (e.target === m) cerrarModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });
}
function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("visible"); obs.unobserve(en.target); } });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => obs.observe(el));
}

// ============================================================
//  HOME
// ============================================================
function renderHome(proyectos, libros) {
  const jd = proyectos.find((p) => p.destacado) || proyectos[0];
  const gc = document.getElementById("featured-game");
  if (gc && jd) {
    const img = gc.querySelector(".featured-image img");
    if (img) img.outerHTML = imgTag(jd.imagen, t(jd.titulo));
    gc.querySelector(".featured-genre").textContent = (jd.categorias || []).join(" · ").toUpperCase();
    gc.querySelector(".featured-title").textContent = t(jd.titulo);
    gc.querySelector(".featured-desc").textContent = t(jd.descripcion);
    gc.querySelector("a.btn").href = `juego.html?id=${encodeURIComponent(jd.id_proyecto)}`;
  }
  const ld = libros.find((l) => l.destacado) || libros[0];
  const bc = document.getElementById("featured-book");
  if (bc && ld) {
    const img = bc.querySelector(".featured-image img");
    if (img) img.outerHTML = imgTag(ld.portada, t(ld.titulo));
    bc.querySelector(".featured-genre").textContent = t(ld.genero).toUpperCase();
    bc.querySelector(".featured-title").textContent = t(ld.titulo);
    bc.querySelector(".featured-desc").textContent = t(ld.sinopsis_corta);
    bc.querySelector("a.btn").href = `libro.html?id=${encodeURIComponent(ld.id_libro)}`;
  }
}

// ============================================================
//  JUEGOS
// ============================================================
let _allProyectos = [];
let filtroPlataformaActivo = "all";
let filtroGeneroActivo = "todos";

function renderizarTarjetasDinamicas(lista) {
  const c = document.getElementById("grid-proyectos");
  if (!c) return;
  if (!lista?.length) {
    c.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1">${t(I18N.resolvePath("juegos_page.noResults"))}</p>`;
    return;
  }
  c.innerHTML = lista.map((p) => `
    <article class="project-card" onclick="irAJuego('${p.id_proyecto}', 'proyectos')" data-categorias="${(p.categorias || []).join(",")}">
      <div class="project-card-image">
        ${imgTag(p.imagen, t(p.titulo))}
        <div class="overlay"></div>
        <div class="play-icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
      </div>
      <div class="project-card-body">
        <div class="project-card-tags">${(p.categorias || []).map((c) => `<span class="project-tag">${c}</span>`).join("")}</div>
        <h3>${t(p.titulo)}</h3>
        <p>${t(p.descripcion).substring(0, 100)}${t(p.descripcion).length > 100 ? "…" : ""}</p>
      </div>
    </article>`).join("");
}
function aplicarFiltrosJuegos() {
  renderizarTarjetasDinamicas(_allProyectos.filter((p) => {
    const cats = (p.categorias || []).map((x) => x.toLowerCase());
    return (filtroPlataformaActivo === "all" || cats.includes(filtroPlataformaActivo))
        && (filtroGeneroActivo === "todos" || cats.includes(filtroGeneroActivo));
  }));
}
function initProjectFiltersDinamicos() {
  const cP = document.getElementById("filter-plataforma");
  const cG = document.getElementById("filter-genero");
  if (!cP && !cG) return;
  const set = new Set();
  _allProyectos.forEach((p) => (p.categorias || []).forEach((c) => set.add(c.toLowerCase())));
  const listaPlat = ["unity", "mobile", "pc", "web", "itch.io", "playstore"];
  const plats = ["all"], gens = ["todos"];
  set.forEach((c) => listaPlat.includes(c) ? plats.push(c) : gens.push(c));

  if (cP) {
    cP.innerHTML = plats.map((p) => `<button class="filter-btn ${p === filtroPlataformaActivo ? "active" : ""}" data-filter="${p}">${p === "all" ? t(I18N.resolvePath("juegos_page.allPlatforms")) : p.charAt(0).toUpperCase() + p.slice(1)}</button>`).join("");
    cP.onclick = (e) => {
      const b = e.target.closest(".filter-btn"); if (!b) return;
      cP.querySelectorAll(".filter-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); filtroPlataformaActivo = b.dataset.filter; aplicarFiltrosJuegos();
    };
  }
  if (cG) {
    cG.innerHTML = gens.map((g) => `<button class="filter-btn ${g === filtroGeneroActivo ? "active" : ""}" data-filter="${g}">${g === "todos" ? t(I18N.resolvePath("juegos_page.allGenres")) : g.charAt(0).toUpperCase() + g.slice(1)}</button>`).join("");
    cG.onclick = (e) => {
      const b = e.target.closest(".filter-btn"); if (!b) return;
      cG.querySelectorAll(".filter-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); filtroGeneroActivo = b.dataset.filter; aplicarFiltrosJuegos();
    };
  }
  aplicarFiltrosJuegos();
}

// ============================================================
//  JUEGO-FICHA
// ============================================================
function renderJuegoFicha(proyectos) {
  const id = new URLSearchParams(location.search).get("id");
  const j = proyectos.find((p) => p.id_proyecto === id);
  const c = document.getElementById("juego-ficha-content");
  if (!j || !c) { if (c) c.innerHTML = `<p style="color:var(--danger)">${t(I18N.resolvePath("ficha.notFoundGame"))}</p>`; return; }
  document.title = `${t(j.titulo)} | irr 222`;
  const items = (j.imagenes_galeria || []).map((im, k) => ({ src: imgSrc(im), caption: captionGaleria(j.textos_galeria?.[k], k) }));
  c.innerHTML = `
    <div class="game-ficha">
      <div class="game-ficha-hero reveal">
        <div class="game-ficha-image">${imgTag(j.imagen, t(j.titulo))}</div>
        <div class="game-ficha-header">
          <div class="project-card-tags">${(j.categorias || []).map((x) => `<span class="project-tag">${x}</span>`).join("")}</div>
          <h1 class="section-title">${t(j.titulo)}</h1>
          <p class="section-subtitle">${t(j.descripcion)}</p>
          <div class="game-ficha-cta">
            ${j.link_juego ? `<a href="${j.link_juego}" target="_blank" rel="noopener" class="btn btn-primary">${t(I18N.resolvePath("ficha.downloadPlay"))}</a>` : ""}
            ${j.link_demo  ? `<a href="${j.link_demo}"  target="_blank" rel="noopener" class="btn btn-ghost">${t(I18N.resolvePath("ficha.demo"))}</a>` : ""}
          </div>
        </div>
      </div>
      <div class="game-ficha-body reveal">
        <div class="game-ficha-section"><h2>${t(I18N.resolvePath("ficha.synopsisGame"))}</h2><div class="game-ficha-text">${t(j.info_publica).replace(/\n/g, "<br>")}</div></div>
        <div class="game-ficha-section"><h2>${t(I18N.resolvePath("ficha.techDetails"))}</h2><div class="game-ficha-text">${t(j.info_tecnica).replace(/\n/g, "<br>")}</div></div>
        ${items.length ? `
        <div class="game-ficha-section"><h2>${t(I18N.resolvePath("ficha.gallery"))}</h2>
          <div class="game-ficha-galeria">
            ${items.map((it, i) => `
              <figure onclick='abrirLightbox(${JSON.stringify(items)}, ${i})'>
                <img src="${escapeAttr(it.src)}" alt="${escapeAttr(it.caption)}" loading="lazy" decoding="async" onerror="window.__imgFallback(this)" />
                <figcaption>${it.caption}</figcaption>
              </figure>`).join("")}
          </div>
        </div>` : ""}
      </div>
    </div>`;
}

// ============================================================
//  LIBROS
// ============================================================
let _allLibros = [];
function renderizarLibros(lista) {
  const c = document.getElementById("grid-libros");
  if (!c) return;
  if (!lista?.length) {
    c.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1">${t(I18N.resolvePath("libros_page.noResults"))}</p>`;
    return;
  }
  c.innerHTML = lista.map((l) => `
    <article class="book-card" onclick="location.href='libro.html?id=${encodeURIComponent(l.id_libro)}'">
      <div class="book-card-cover">
        ${imgTag(l.portada, t(l.titulo))}
        <div class="book-card-overlay"><span class="book-card-cta">→</span></div>
      </div>
      <div class="book-card-body">
        <span class="book-card-genre">${t(l.genero)}</span>
        <h3>${t(l.titulo)}</h3>
        <p>${t(l.sinopsis_corta)}</p>
        <div class="book-card-meta">
          <span>📅 ${l.anio}</span>
          <span>📄 ${l.paginas} ${t(I18N.resolvePath("libros_page.metaPages"))}</span>
        </div>
      </div>
    </article>`).join("");
}
function initBookFilters() {
  const f = document.getElementById("books-filter");
  if (!f) return;
  const generos = Array.from(new Set(_allLibros.map((l) => t(l.genero))));
  f.innerHTML = `<button class="filter-btn active" data-filter="all">${t(I18N.resolvePath("libros_page.filterAll"))}</button>` +
    generos.map((g) => `<button class="filter-btn" data-filter="${g}">${g}</button>`).join("");
  f.onclick = (e) => {
    const b = e.target.closest(".filter-btn"); if (!b) return;
    f.querySelectorAll(".filter-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    renderizarLibros(b.dataset.filter === "all" ? _allLibros : _allLibros.filter((l) => t(l.genero) === b.dataset.filter));
  };
}
function renderLibroFicha(libros) {
  const id = new URLSearchParams(location.search).get("id");
  const l = libros.find((x) => x.id_libro === id);
  const c = document.getElementById("libro-ficha-content");
  if (!l || !c) { if (c) c.innerHTML = `<p style="color:var(--danger)">${t(I18N.resolvePath("ficha.notFoundBook"))}</p>`; return; }
  document.title = `${t(l.titulo)} | irr 222`;
  c.innerHTML = `
    <div class="book-ficha">
      <div class="book-ficha-hero reveal">
        <div class="book-ficha-cover">${imgTag(l.portada, t(l.titulo))}</div>
        <div class="book-ficha-header">
          <span class="book-card-genre">${t(l.genero)}</span>
          <h1 class="section-title">${t(l.titulo)}</h1>
          <div class="book-ficha-meta">
            <span>📅 ${l.anio}</span>
            <span>📄 ${l.paginas} ${I18N.lang === "en" ? "pages" : "páginas"}</span>
            <span>📚 ${t(l.formato)}</span>
          </div>
          <p class="section-subtitle">${t(l.sinopsis_corta)}</p>
          <div class="book-ficha-cta">
            ${l.enlace_compra ? `<a href="${l.enlace_compra}" target="_blank" rel="noopener" class="btn btn-primary">${t(I18N.resolvePath("ficha.buyBook"))}</a>` : ""}
            ${l.enlace_lectura ? `<a href="${l.enlace_lectura}" target="_blank" rel="noopener" class="btn btn-ghost">${t(I18N.resolvePath("ficha.readChapter"))}</a>` : ""}
          </div>
        </div>
      </div>
      <div class="book-ficha-body reveal">
        <div class="book-ficha-section"><h2>${t(I18N.resolvePath("ficha.fullSynopsis"))}</h2><div class="book-ficha-text">${t(l.sinopsis_completa).replace(/\n/g, "<br>")}</div></div>
        ${l.primer_capitulo ? `<div class="book-ficha-section"><h2>${t(I18N.resolvePath("ficha.firstLines"))}</h2><blockquote class="book-ficha-quote">"${t(l.primer_capitulo)}"</blockquote></div>` : ""}
      </div>
    </div>`;
}

// ============================================================
//  OTROS PROYECTOS
// ============================================================
let _allOtros = [];
let filtroTipoActivo = "all";
let filtroTechActivo = "all";
const TIPO_ICON = { tdr: "🔬", herramienta: "🛠️", investigacion: "📖" };

function renderizarOtrosGrid(lista) {
  const c = document.getElementById("grid-otros");
  if (!c) return;
  if (!lista?.length) {
    c.innerHTML = `<p style="color:var(--text-muted);text-align:center;grid-column:1/-1">${t(I18N.resolvePath("otros_page.noResults"))}</p>`;
    return;
  }
  c.innerHTML = lista.map((o) => {
    const icon = TIPO_ICON[o.tipo] || "📁";
    return `
      <article class="other-card" onclick="location.href='otro.html?id=${encodeURIComponent(o.id_proyecto)}'">
        <div class="other-card-image">
          ${imgTag(o.imagen, t(o.titulo))}
          <span class="other-card-type">${icon} ${o.tipo}</span>
        </div>
        <div class="other-card-body">
          <span class="other-card-cat">${t(o.categoria)}</span>
          <h3>${t(o.titulo)}</h3>
          <p>${t(o.descripcion).substring(0, 130)}${t(o.descripcion).length > 130 ? "…" : ""}</p>
          <div class="other-card-tech">${(o.tecnologias || []).slice(0, 4).map((tech) => `<span class="tech-chip">${tech}</span>`).join("")}</div>
        </div>
      </article>`;
  }).join("");
}
function aplicarFiltrosOtros() {
  renderizarOtrosGrid(_allOtros.filter((o) => {
    const okTipo = filtroTipoActivo === "all" || o.tipo === filtroTipoActivo;
    const okTech = filtroTechActivo === "all" || (o.tecnologias || []).map((x) => x.toLowerCase()).includes(filtroTechActivo);
    return okTipo && okTech;
  }));
}
function initOtrosFilters() {
  const cTipo = document.getElementById("filter-otro-tipo");
  const cTech = document.getElementById("filter-otro-tech");
  if (!cTipo && !cTech) return;
  const tipos = ["all", ...Array.from(new Set(_allOtros.map((o) => o.tipo)))];
  const techs = Array.from(new Set(_allOtros.flatMap((o) => o.tecnologias || []))).map((x) => x.toLowerCase());
  if (cTipo) {
    cTipo.innerHTML = tipos.map((tip) => `<button class="filter-btn ${tip === filtroTipoActivo ? "active" : ""}" data-filter="${tip}">${tip === "all" ? t(I18N.resolvePath("otros_page.allTypes")) : (TIPO_ICON[tip] || "") + " " + tip.charAt(0).toUpperCase() + tip.slice(1)}</button>`).join("");
    cTipo.onclick = (e) => {
      const b = e.target.closest(".filter-btn"); if (!b) return;
      cTipo.querySelectorAll(".filter-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); filtroTipoActivo = b.dataset.filter; aplicarFiltrosOtros();
    };
  }
  if (cTech) {
    cTech.innerHTML = ["all", ...techs].map((tech) => `<button class="filter-btn ${tech === filtroTechActivo ? "active" : ""}" data-filter="${tech}">${tech === "all" ? t(I18N.resolvePath("otros_page.allTech")) : tech.charAt(0).toUpperCase() + tech.slice(1)}</button>`).join("");
    cTech.onclick = (e) => {
      const b = e.target.closest(".filter-btn"); if (!b) return;
      cTech.querySelectorAll(".filter-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); filtroTechActivo = b.dataset.filter; aplicarFiltrosOtros();
    };
  }
  aplicarFiltrosOtros();
}
function renderOtroFicha(otros) {
  const id = new URLSearchParams(location.search).get("id");
  const o = otros.find((x) => x.id_proyecto === id);
  const c = document.getElementById("otro-ficha-content");
  if (!o || !c) { if (c) c.innerHTML = `<p style="color:var(--danger)">${t(I18N.resolvePath("ficha.notFoundOtro"))}</p>`; return; }
  document.title = `${t(o.titulo)} | irr 222`;
  const icon = TIPO_ICON[o.tipo] || "📁";
  c.innerHTML = `
    <div class="other-ficha">
      <div class="other-ficha-hero reveal">
        <div class="other-ficha-image">${imgTag(o.imagen, t(o.titulo))}</div>
        <div class="other-ficha-header">
          <span class="other-card-type">${icon} ${o.tipo}</span>
          <span class="book-card-genre">${t(o.categoria)}</span>
          <h1 class="section-title">${t(o.titulo)}</h1>
          <p class="section-subtitle">${t(o.descripcion)}</p>
          <div class="other-ficha-meta">
            <div><strong>${t(I18N.resolvePath("ficha.context"))}:</strong> <span>${t(o.contexto)}</span></div>
            <div><strong>${t(I18N.resolvePath("ficha.status"))}:</strong> <span>${t(o.estado)}</span></div>
          </div>
          <div class="other-ficha-tech">
            <h4>${t(I18N.resolvePath("ficha.tech"))}</h4>
            <div class="tech-stack">${(o.tecnologias || []).map((x) => `<span class="tech-chip tech-chip-lg">${x}</span>`).join("")}</div>
          </div>
          ${(o.enlaces?.length) ? `
          <div class="other-ficha-links">
            <h4>${t(I18N.resolvePath("ficha.links"))}</h4>
            <div class="link-buttons">
              ${o.enlaces.map((lnk) => `<a href="${lnk.url}" target="_blank" rel="noopener" class="btn btn-${lnk.tipo === "repo" ? "ghost" : "primary"} btn-sm">${t(lnk.label)}</a>`).join("")}
            </div>
          </div>` : ""}
        </div>
      </div>
      <div class="other-ficha-body reveal">
        <div class="other-ficha-section"><h2>📖 ${t(I18N.resolvePath("ficha.synopsisGame"))}</h2><div class="other-ficha-text">${t(o.info_publica).replace(/\n/g, "<br>")}</div></div>
        <div class="other-ficha-section"><h2>${t(I18N.resolvePath("ficha.techDetails"))}</h2><div class="other-ficha-text">${t(o.info_tecnica).replace(/\n/g, "<br>")}</div></div>
      </div>
    </div>`;
}

// ============================================================
//  DEVLOGS (acordeón + modal)
// ============================================================
let _devlogsVisibles = DEVLOGS_GRUPOS_POR_PAGINA;
function renderDevblogsGeneral(proyectos, devblogs) {
  const c = document.getElementById("lista-devblogs"), btn = document.getElementById("devblogs-load-more");
  window._devblogs = devblogs || [];
  if (!c) return;
  if (!devblogs?.length) { c.innerHTML = "<p style='color:var(--text-muted);text-align:center'>—</p>"; if (btn) btn.style.display = "none"; return; }
  const g = {};
  devblogs.forEach((d) => { (g[d.idProyecto] = g[d.idProyecto] || []).push(d); });
  const juegos = proyectos.filter((j) => (g[j.id_proyecto] || []).length > 0).slice(0, _devlogsVisibles);
  c.innerHTML = juegos.map((j) => {
    const ups = g[j.id_proyecto];
    return `
      <div class="grupo-juego-devblog">
        <div class="devlog-item" onclick="toggleDevblogs('${j.id_proyecto}')">
          <div class="devlog-info"><span class="tag-juego-small">${t(j.titulo)}</span><h3>${I18N.lang === "en" ? "Updates for" : "Actualizaciones de"} ${t(j.titulo)}</h3></div>
          <div class="devlog-meta"><span>${ups.length}</span><span class="chevron" id="chevron-${j.id_proyecto}">▼</span></div>
        </div>
        <div id="desplegable-${j.id_proyecto}" class="devblog-desplegable">
          ${ups.map((u) => {
            const i = devblogs.indexOf(u);
            return `<div class="devlog-item devlog-hijo" onclick="event.stopPropagation(); abrirDevblog(${i})">
              <div class="devlog-info"><h3>${t(u.titulo)}</h3><p>${t(u.contenido).substring(0, 120)}…</p></div>
              <div class="devlog-meta"><span>${formatearFecha(u.fecha)}</span></div>
            </div>`;
          }).join("")}
        </div>
      </div>`;
  }).join("") || "<p style='color:var(--text-muted);text-align:center'>—</p>";
  if (btn) {
    const rest = proyectos.filter((j) => (g[j.id_proyecto] || []).length > 0).length - _devlogsVisibles;
    if (rest > 0) { btn.style.display = "inline-flex"; btn.textContent = `${t(I18N.resolvePath("home.activityLoadMore"))} (${rest})`; }
    else btn.style.display = "none";
  }
}
function initDevblogsLoadMore() {
  const b = document.getElementById("devblogs-load-more"); if (!b) return;
  b.addEventListener("click", () => { _devlogsVisibles += DEVLOGS_GRUPOS_POR_PAGINA; renderDevblogsGeneral(window._proyectos || [], window._devblogs || []); });
}
window.toggleDevblogs = function (id) {
  const p = document.getElementById(`desplegable-${id}`), ch = document.getElementById(`chevron-${id}`);
  if (!p) return;
  const abierto = p.classList.toggle("abierto");
  if (ch) ch.textContent = abierto ? "▲" : "▼";
};
window.abrirDevblog = function (index) {
  const d = (window._devblogs || [])[index]; if (!d) return;
  const esLibro = d.tipo === "libro";
  const ent = esLibro ? (window._libros || []).find((l) => l.id_libro === d.idProyecto)
                      : (window._proyectos || []).find((p) => p.id_proyecto === d.idProyecto);
  const nombre = ent ? t(ent.titulo) : d.idProyecto;
  const modal = document.getElementById("game-modal"), body = document.getElementById("modal-body");
  if (!modal || !body) return;
  body.innerHTML = `
    <div class="modal-devblog">
      <p class="modal-meta">${esLibro ? "📚" : "🎮"} ${nombre} · ${formatearFecha(d.fecha)}</p>
      <h1 class="modal-titulo">${t(d.titulo)}</h1>
      <div class="modal-contenido">${t(d.contenido).replace(/\n/g, "<br>")}</div>
      ${!esLibro ? `<button class="btn btn-ghost" style="margin-top:24px" onclick="irAJuego('${d.idProyecto}', 'actividad')">${t(I18N.resolvePath("ficha.viewGame"))}</button>` : ""}
    </div>`;
  modal.style.display = "block"; document.body.style.overflow = "hidden";
};

// ============================================================
//  TRAYECTORIA: TIMELINE INVERTIDO + ÍNDICE
// ============================================================
let _timelineObserver = null;
function renderTimeline(data) {
  const c = document.getElementById("timeline");
  const idx = document.getElementById("timeline-index");
  if (!c) return;
  if (!data?.length) { c.innerHTML = '<p style="color:var(--text-muted);text-align:center">—</p>'; if (idx) idx.innerHTML = ""; return; }

  // Orden inverso (más nuevo → más viejo)
  const etapas = [...data].sort((a, b) => parseInt(b.anio || 0, 10) - parseInt(a.anio || 0, 10));

  c.innerHTML = etapas.map((et) => {
    const yid = `year-${et.anio || "sin-fecha"}`;
    const hitos = [...(et.hitos || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return `
      <div class="timeline-year" id="${yid}" data-year="${et.anio}">
        <div class="timeline-year-marker">${t(et.etapa)}</div>
        <div class="timeline-entries">
          ${hitos.map((h) => {
            const major = h.importancia === "major";
            const tipo  = h.tipo || "juego";
            const tagCls = tipo === "libro" ? "tag-libro" : tipo === "otros" ? "tag-otros" : "tag-juego";
            const icon = tipo === "libro" ? "📚" : tipo === "otros" ? "🔬" : "🎮";
            return `
              <div class="timeline-entry ${major ? "major" : "minor"} reveal">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                  <div class="timeline-meta">
                    <span class="timeline-date">${formatearFecha(h.fecha)}</span>
                    <span class="timeline-tag ${tagCls}">${icon} ${tipo}</span>
                    ${major ? `<span class="timeline-tag tag-major">⭐ ${t(I18N.resolvePath("trayectoria_page.badgeMajor"))}</span>`
                            : `<span class="timeline-tag tag-minor">${t(I18N.resolvePath("trayectoria_page.badgeMinor"))}</span>`}
                  </div>
                  <h3>${t(h.titulo)}</h3>
                  <p>${t(h.descripcion)}</p>
                </div>
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }).join("");

  if (idx) {
    idx.innerHTML = etapas.map((et) => {
      const yid = `year-${et.anio || "sin-fecha"}`;
      return `<button class="timeline-index-item" data-target="${yid}">
        <span class="timeline-index-year">${et.anio || "—"}</span>
        <span class="timeline-index-count">${(et.hitos || []).length}</span>
      </button>`;
    }).join("");
    idx.querySelectorAll(".timeline-index-item").forEach((b) => b.addEventListener("click", () => {
      const el = document.getElementById(b.dataset.target);
      if (!el) return;
      const off = window.innerWidth <= 900 ? 140 : 110;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off, behavior: "smooth" });
    }));
  }
  iniciarScrollSpyTimeline();
}
function iniciarScrollSpyTimeline() {
  if (_timelineObserver) _timelineObserver.disconnect();
  const items = document.querySelectorAll(".timeline-index-item");
  const years = document.querySelectorAll(".timeline-year");
  if (!items.length || !years.length) return;
  let activeId = null;
  _timelineObserver = new IntersectionObserver((entries) => {
    const visibles = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (!visibles.length) return;
    const id = visibles[0].target.id;
    if (id === activeId) return;
    activeId = id;
    items.forEach((it) => {
      const on = it.dataset.target === id;
      it.classList.toggle("active", on);
      if (on && window.innerWidth <= 900) it.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  }, { rootMargin: "-120px 0px -60% 0px", threshold: 0 });
  years.forEach((y) => _timelineObserver.observe(y));
}

// ============================================================
//  LIGHTBOX
// ============================================================
let _lbItems = [], _lbIdx = 0;
window.abrirLightbox = function (items, index = 0) {
  const lb = document.getElementById("lightbox"), img = document.getElementById("lightbox-img");
  const cap = document.getElementById("lightbox-caption"), ctr = document.getElementById("lightbox-counter");
  if (!lb || !img || !items?.length) return;
  _lbItems = items; _lbIdx = index;
  const it = items[index];
  img.src = it.src; img.alt = it.caption || "";
  if (cap) cap.textContent = it.caption || "";
  if (ctr) ctr.textContent = I18N.lang === "en" ? `Image ${index + 1} of ${items.length}` : `Imagen ${index + 1} de ${items.length}`;
  document.querySelectorAll(".lightbox-nav").forEach((b) => b.style.display = items.length > 1 ? "flex" : "none");
  lb.classList.add("open"); document.body.style.overflow = "hidden";
};
window.cerrarLightbox = function () {
  const lb = document.getElementById("lightbox"); if (!lb) return;
  lb.classList.remove("open"); document.body.style.overflow = "";
  setTimeout(() => { const img = document.getElementById("lightbox-img"); if (img && !lb.classList.contains("open")) img.src = ""; }, 320);
};
window.lightboxPrev = function (e) {
  if (e) e.stopPropagation();
  if (_lbItems.length <= 1) return;
  _lbIdx = (_lbIdx - 1 + _lbItems.length) % _lbItems.length;
  actualizarLightbox();
};
window.lightboxNext = function (e) {
  if (e) e.stopPropagation();
  if (_lbItems.length <= 1) return;
  _lbIdx = (_lbIdx + 1) % _lbItems.length;
  actualizarLightbox();
};
function actualizarLightbox() {
  const it = _lbItems[_lbIdx], img = document.getElementById("lightbox-img");
  const cap = document.getElementById("lightbox-caption"), ctr = document.getElementById("lightbox-counter");
  if (!it || !img) return;
  img.style.opacity = "0.4"; img.src = it.src; img.alt = it.caption || "";
  if (cap) cap.textContent = it.caption || "";
  if (ctr) ctr.textContent = I18N.lang === "en" ? `Image ${_lbIdx + 1} of ${_lbItems.length}` : `Imagen ${_lbIdx + 1} de ${_lbItems.length}`;
  img.onload = () => { img.style.opacity = "1"; };
}
document.addEventListener("keydown", (e) => {
  const lb = document.getElementById("lightbox"); if (!lb?.classList.contains("open")) return;
  if (e.key === "Escape") cerrarLightbox();
  if (e.key === "ArrowLeft") lightboxPrev();
  if (e.key === "ArrowRight") lightboxNext();
});
// Swipe táctil
(function initLightboxSwipe() {
  let startX = 0, startY = 0;
  document.addEventListener("touchstart", (e) => {
    const lb = document.getElementById("lightbox");
    if (!lb?.classList.contains("open")) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    const lb = document.getElementById("lightbox");
    if (!lb?.classList.contains("open")) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? lightboxNext() : lightboxPrev();
    }
  }, { passive: true });
})();

// ============================================================
//  NAVEGACIÓN
// ============================================================
window.irAJuego = function (id, from = "proyectos") {
  try { sessionStorage.setItem("volverScroll", String(window.scrollY)); sessionStorage.setItem("volverSeccion", from); } catch (e) {}
  window.location.href = `juego.html?id=${encodeURIComponent(id)}&from=${from}`;
};
function restaurarScrollDeVuelta() {
  const s = sessionStorage.getItem("volverScroll"); if (s === null) return;
  sessionStorage.removeItem("volverScroll"); sessionStorage.removeItem("volverSeccion");
  setTimeout(() => window.scrollTo({ top: parseInt(s, 10) || 0, behavior: "auto" }), 60);
}

// ============================================================
//  RENDER POR PÁGINA
// ============================================================
function renderCurrentPage() {
  applyStaticI18n();
  const page = paginaActual();
  const { proyectos = [], libros = [], otros_proyectos = [], trayectoria = [], devblogs = [] } = window._data || {};

  if (page === "home") {
    renderHome(proyectos, libros);
    renderDevblogsGeneral(proyectos, devblogs);
    initDevblogsLoadMore();
  } else if (page === "juegos") {
    _allProyectos = proyectos;
    filtroPlataformaActivo = "all"; filtroGeneroActivo = "todos";
    initProjectFiltersDinamicos();
  } else if (page === "libros") {
    _allLibros = libros;
    renderizarLibros(_allLibros);
    initBookFilters();
  } else if (page === "otros") {
    _allOtros = otros_proyectos;
    filtroTipoActivo = "all"; filtroTechActivo = "all";
    initOtrosFilters();
  } else if (page === "juego-ficha") {
    renderJuegoFicha(proyectos);
  } else if (page === "libro-ficha") {
    renderLibroFicha(libros);
  } else if (page === "otro-ficha") {
    renderOtroFicha(otros_proyectos);
  } else if (page === "trayectoria") {
    renderTimeline(trayectoria);
  }
  requestAnimationFrame(() => initReveal());
}

// ============================================================
//  ARRANQUE
// ============================================================
async function init() {
  await cargarConfig();
  I18N.set(I18N.lang);
  initThemeToggle();
  initNavbar();
  initModalClose();
  initLangSelector();

  try {
    const data = await cargarDatos();
    window._data = data;
    window._proyectos = data.proyectos;
    window._libros = data.libros;
    window._devblogs = data.devblogs;
    renderCurrentPage();
    restaurarScrollDeVuelta();
  } catch (err) {
    console.error("[Hub] ❌", err);
    ["grid-proyectos", "grid-libros", "grid-otros", "lista-devblogs", "timeline"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<p style="color:var(--danger);text-align:center">Error al cargar datos.</p>';
    });
    initReveal();
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();