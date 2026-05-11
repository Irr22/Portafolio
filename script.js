// ============================================================
//  CONFIGURACIÓN CENTRAL — Edita aquí y en ningún otro sitio
// ============================================================
const CONFIG = {
  // URL de tu hoja de Sheety. Deja en "" para usar solo local.
  SHEETY_URL: "",

  // Fuente de datos local
  LOCAL_URL: "./datos.json",

  // Cuántos días considera "reciente" un devblog de Sheety
  // antes de que lo quieras migrar a local
  DIAS_ANTES_ARCHIVAR: 90,
};

// ============================================================
//  CAPA DE DATOS — Combina local + nube de forma transparente
// ============================================================

/**
 * Carga proyectos (siempre local) y devblogs (local + Sheety si hay URL).
 * Los devblogs de Sheety se fusionan con los locales sin duplicados.
 * Los proyectos siempre vienen del JSON local para que sean estables.
 */
async function cargarDatos() {
  try {
    // 1. Carga base local (siempre obligatoria)
    const resLocal = await fetch(CONFIG.LOCAL_URL);
    if (!resLocal.ok) throw new Error("No se pudo cargar datos.json");
    const local = await resLocal.json();

    console.log("[Datos] Local cargado:", local);

    let devblogs = [...(local.devblogs || [])];

    // 2. Si hay URL de Sheety, intenta cargar devblogs extra
    if (CONFIG.SHEETY_URL) {
      try {
        const resNube = await fetch(CONFIG.SHEETY_URL);
        if (resNube.ok) {
          const nube = await resNube.json();

          // Sheety devuelve { nombreHoja: [...] } o { devblogs: [...] }
          const nubeDevblogs = nube.devblogs || nube[Object.keys(nube)[0]] || [];

          // Fusiona: los locales tienen prioridad, los de nube se añaden si no existen
          const titulosLocales = new Set(devblogs.map((d) => d.titulo + d.idProyecto));
          const nuevos = nubeDevblogs.filter(
            (d) => !titulosLocales.has(d.titulo + d.idProyecto)
          );

          if (nuevos.length > 0) {
            console.info(`[Datos] ${nuevos.length} devblog(s) nuevos desde Sheety`);
            devblogs = [...devblogs, ...nuevos];
          }
        }
      } catch (err) {
        console.warn("[Datos] Sheety no disponible, usando solo local:", err.message);
      }
    }

    // Ordenar devblogs de más reciente a más antiguo
    devblogs.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    console.log("[Datos] Total devblogs:", devblogs.length);
    console.log("[Datos] Total proyectos:", local.proyectos.length);

    return { proyectos: local.proyectos || [], devblogs };
  } catch (err) {
    console.error("[Datos] Error al cargar:", err);
    throw err;
  }
}

/**
 * Utilidad de migración: imprime en consola el JSON de los devblogs
 * de Sheety que llevan más de CONFIG.DIAS_ANTES_ARCHIVAR días,
 * listos para pegar en datos.json y borrar de Sheety.
 *
 * Uso: abre la consola del navegador y llama a migrarALocal()
 */
window.migrarALocal = async function () {
  if (!CONFIG.SHEETY_URL) {
    console.warn("⚠️ Configura CONFIG.SHEETY_URL primero.");
    return;
  }
  const datos = await cargarDatos();
  const limite = new Date();
  limite.setDate(limite.getDate() - CONFIG.DIAS_ANTES_ARCHIVAR);

  const paraArchivar = datos.devblogs.filter((d) => new Date(d.fecha) < limite);
  console.log(
    `%c[Migración] ${paraArchivar.length} devblogs para mover a local:`,
    "color: #00ffcc; font-weight: bold"
  );
  console.log(JSON.stringify(paraArchivar, null, 2));
  console.info(
    "👆 Copia este JSON, pégalo en datos.json > devblogs y elimínalos de Sheety."
  );
};

// ============================================================
//  RENDERIZADO — Tarjetas de proyectos
// ============================================================

function renderizarTarjetas(lista) {
  const container = document.getElementById("grid-proyectos");
  if (!container) {
    console.warn("[Render] No se encontró #grid-proyectos");
    return;
  }

  if (!lista || lista.length === 0) {
    container.innerHTML = '<p style="color:#aaa;text-align:center">No hay proyectos disponibles.</p>';
    return;
  }

  container.innerHTML = lista
    .map(
      (p) => `
    <div class="card-proyecto"
         style="background-image: url('${p.imagen}')"
         onclick="window.location.href='juego.html?id=${p.id_proyecto}'">
      <div class="info-proyecto">
        <h3>${p.titulo}</h3>
        <p>${p.descripcion.substring(0, 80)}…</p>
      </div>
    </div>`
    )
    .join("");

  console.log(`[Render] ${lista.length} proyectos renderizados`);
}

// ============================================================
//  RENDERIZADO — Sección de Actividad (devblogs agrupados)
// ============================================================

function renderDevblogsGeneral(proyectos, devblogs) {
  const container = document.getElementById("lista-devblogs");
  if (!container) {
    console.warn("[Render] No se encontró #lista-devblogs");
    return;
  }

  if (!devblogs || devblogs.length === 0) {
    container.innerHTML = "<p style='color:#aaa;text-align:center'>Sin actividad reciente.</p>";
    console.log("[Render] No hay devblogs para mostrar");
    return;
  }

  // Agrupa devblogs por proyecto
  const grupos = {};
  devblogs.forEach((d) => {
    const key = d.idProyecto;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(d);
  });

  console.log("[Render] Grupos de devblogs:", Object.keys(grupos));

  // Solo muestra proyectos que tengan al menos un devblog
  const html = proyectos
    .filter(juego => grupos[juego.id_proyecto] && grupos[juego.id_proyecto].length > 0)
    .map((juego) => {
      const updates = grupos[juego.id_proyecto];

      return `
      <div class="grupo-juego-devblog">
        <div class="devlog-item" onclick="toggleDevblogs('${juego.id_proyecto}')">
          <div class="devlog-info">
            <span class="tag-juego-small">${juego.titulo}</span>
            <h3>Actualizaciones de ${juego.titulo}</h3>
          </div>
          <div class="devlog-meta">
            <span>${updates.length} entrada${updates.length !== 1 ? "s" : ""}</span>
            <span class="chevron" id="chevron-${juego.id_proyecto}">▼</span>
          </div>
        </div>

        <div id="desplegable-${juego.id_proyecto}" class="devblog-desplegable">
          ${updates
            .map(
              (u) => `
            <div class="devlog-item devlog-hijo"
                 onclick="event.stopPropagation(); abrirDevblog(${JSON.stringify(u).replace(/"/g, "&quot;")})">
              <div class="devlog-info">
                <h3>${u.titulo}</h3>
                <p>${u.contenido.substring(0, 120)}…</p>
              </div>
              <div class="devlog-meta">
                <span>${formatearFecha(u.fecha)}</span>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
    })
    .join("");

  if (html) {
    container.innerHTML = html;
    console.log("[Render] Devblogs renderizados correctamente");
  } else {
    container.innerHTML = "<p style='color:#aaa;text-align:center'>Sin actividad reciente.</p>";
    console.log("[Render] No hay proyectos con devblogs");
  }
}

// ============================================================
//  INTERACCIÓN — Modal y acordeón
// ============================================================

function formatearFecha(fechaStr) {
  if (!fechaStr) return "";
  const d = new Date(fechaStr + "T00:00:00"); // evita desfase de zona horaria
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

window.toggleDevblogs = function (id) {
  const panel = document.getElementById(`desplegable-${id}`);
  const chevron = document.getElementById(`chevron-${id}`);
  if (!panel) return;
  const abierto = panel.classList.toggle("abierto");
  if (chevron) chevron.textContent = abierto ? "▲" : "▼";
};

window.abrirDevblog = function (devblog) {
  const modal = document.getElementById("game-modal");
  const body = document.getElementById("modal-body");

  // Busca el proyecto para mostrar el nombre
  const juego = (window._proyectos || []).find((p) => p.id_proyecto === devblog.idProyecto);
  const nombreJuego = juego ? juego.titulo : devblog.idProyecto;

  body.innerHTML = `
    <div class="modal-devblog">
      <p class="modal-meta">${nombreJuego} · ${formatearFecha(devblog.fecha)}</p>
      <h1 class="modal-titulo">${devblog.titulo}</h1>
      <div class="modal-contenido">${devblog.contenido.replace(/\n/g, "<br>")}</div>
    </div>`;

  modal.style.display = "block";
  document.body.style.overflow = "hidden";
};

window.cerrarModal = function () {
  document.getElementById("game-modal").style.display = "none";
  document.body.style.overflow = "";
};

// Cierra el modal al hacer clic fuera del contenido
document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("game-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) cerrarModal();
    });
  }
});

// ============================================================
//  ARRANQUE
// ============================================================

async function cargarHubPrincipal() {
  console.log("[Hub] Iniciando carga...");
  
  try {
    const { proyectos, devblogs } = await cargarDatos();

    // Guardamos referencia global para el modal
    window._proyectos = proyectos;

    renderizarTarjetas(proyectos);
    renderDevblogsGeneral(proyectos, devblogs);

    console.log("[Hub] ✅ Carga completada exitosamente");
  } catch (err) {
    console.error("[Hub] ❌ Error fatal al cargar datos:", err);
    
    const grid = document.getElementById("grid-proyectos");
    if (grid) {
      grid.innerHTML =
        '<p style="color:#f66;text-align:center">Error al cargar proyectos. Comprueba que datos.json esté accesible.</p>';
    }

    const devlogsContainer = document.getElementById("lista-devblogs");
    if (devlogsContainer) {
      devlogsContainer.innerHTML =
        '<p style="color:#f66;text-align:center">Error al cargar actividad.</p>';
    }
  }
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cargarHubPrincipal);
} else {
  cargarHubPrincipal();
}