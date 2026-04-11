// CONFIGURACIÓN DE TUS URLs DE SHEETY
const API_PROYECTOS = 'https://api.sheety.co/ffcb333675bc44ea2aefba77a908a532/portfolio/proyectos'; 
const API_DEVBLOGS = 'https://api.sheety.co/ffcb333675bc44ea2aefba77a908a532/portfolio/devblogs';

// Variables globales para guardar los datos y no tener que llamar a la API cada vez
window.baseDeDatosJuegos = [];
window.listaTodosDevblogs = [];

async function cargarHubPrincipal() {
    const gridProyectos = document.getElementById('grid-proyectos');
    const listaDevblogs = document.getElementById('lista-devblogs');

    try {
        console.log("Cargando datos de Sheety...");

        // 1. Descargar Proyectos y Devblogs en paralelo para ganar velocidad
        const [resP, resD] = await Promise.all([
            fetch(API_PROYECTOS),
            fetch(API_DEVBLOGS)
        ]);

        if (!resP.ok || !resD.ok) throw new Error("Error al conectar con una de las hojas de Sheety");

        const dataP = await resP.json();
        const dataD = await resD.json();

        // Extraer las listas y APLICAR REVERSE (Invertir orden: lo último primero)
        window.baseDeDatosJuegos = dataP[Object.keys(dataP)[0]].reverse();
        window.listaTodosDevblogs = dataD[Object.keys(dataD)[0]].reverse();

        // 2. Renderizar los Juegos en el Grid
        renderizarTarjetas(window.baseDeDatosJuegos);

        // 3. Renderizar los Devblogs en la sección de Actividad
        renderDevblogsGeneral(window.baseDeDatosJuegos, window.listaTodosDevblogs);

    } catch (err) {
        console.error("Fallo crítico:", err);
        if (gridProyectos) gridProyectos.innerHTML = `<p style="color:red;">Error de conexión. Revisa la consola (F12).</p>`;
    }
}

// Muestra las tarjetas de los juegos
function renderizarTarjetas(lista) {
    const container = document.getElementById('grid-proyectos');
    if (!container) return;
    
    container.innerHTML = lista.map((p, index) => `
        <div class="card-proyecto" style="background-image: url('${p.imagen}')" onclick="abrirDetalleJuego(${index})">
            <div class="info-proyecto">
                <h3>${p.titulo || 'Sin nombre'}</h3>
                <p>${p.descripcion ? p.descripcion.substring(0, 60) : ''}...</p>
            </div>
        </div>
    `).join('');
}

// Muestra la lista de noticias en "Actividad Reciente"
function renderDevblogsGeneral(proyectos, devblogs) {
    const container = document.getElementById('lista-devblogs');
    if (!container) return;

    // 1. Agrupamos los devblogs por idProyecto
    const grupos = {};
    devblogs.forEach(d => {
        if (!grupos[d.idProyecto]) grupos[d.idProyecto] = [];
        grupos[d.idProyecto].push(d);
    });

    // 2. Generamos el HTML (usando los proyectos ya invertidos)
    container.innerHTML = proyectos.map(juego => {
        const susUpdates = grupos[juego.idProyecto || juego.id_proyecto] || [];
        if (susUpdates.length === 0) return ''; // No mostrar juegos sin noticias

        return `
            <div class="grupo-juego-devblog">
                <div class="devlog-item" onclick="toggleDevblogs('${juego.idProyecto || juego.id_proyecto}')">
                    <div class="devlog-info">
                        <span class="tag-juego-small">${juego.titulo}</span>
                        <h3>Ver actualizaciones de ${juego.titulo}</h3>
                        <p>Total: ${susUpdates.length} entradas publicadas</p>
                    </div>
                    <div class="devlog-meta">
                        <span>Click para expandir</span>
                    </div>
                </div>

                <div id="desplegable-${juego.idProyecto || juego.id_proyecto}" class="devblog-desplegable" style="display:none; flex-direction:column; gap:10px;">
                    ${susUpdates.map(u => `
                        <div class="devlog-item" style="border-left-color: #555; background: #1a1a1a;" 
                             onclick="event.stopPropagation(); abrirDevblogCompleto('${u.titulo}', \`${u.contenido}\`, '${juego.titulo}', '${u.fecha}')">
                            <div class="devlog-info">
                                <h3>${u.titulo}</h3>
                                <p>${u.contenido.substring(0, 60)}...</p>
                            </div>
                            <div class="devlog-meta">
                                <span>${u.fecha}</span>
                                <button class="btn-leer-mini">Leer más</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

// MODAL: Ver detalles de un juego
window.abrirDetalleJuego = function(index) {
    const juego = window.baseDeDatosJuegos[index];
    const modal = document.getElementById('game-modal');
    const body = document.getElementById('modal-body');

    const susUpdates = window.listaTodosDevblogs.filter(d => 
        d.idProyecto === (juego.idProyecto || juego.id_proyecto)
    );

    body.innerHTML = `
        <div class="modal-grid">
            <div class="modal-left">
                <img src="${juego.imagen}" class="modal-img">
            </div>
            <div class="modal-right">
                <h2>${juego.titulo}</h2>
                <p style="margin-bottom:20px;">${juego.descripcion}</p>
                <a href="${juego.linkJuego || '#'}" target="_blank" class="btn-main" style="text-decoration:none; display:inline-block; text-align:center;">IR AL JUEGO</a>
                
                <div style="margin-top:30px; border-top:1px solid #eee; padding-top:20px;">
                    <h4 style="margin-bottom:10px;">Últimas noticias de este juego:</h4>
                    ${susUpdates.length > 0 ? susUpdates.map(u => `
                        <div style="font-size:0.85rem; margin-bottom:10px; cursor:pointer; color:#555;" onclick="abrirDevblogCompleto('${u.titulo}', \`${u.contenido}\`, '${juego.titulo}', '${u.fecha}')">
                            <strong>• ${u.titulo}</strong> <span style="color:#999">(${u.fecha})</span>
                        </div>
                    `).join('') : '<p style="color:#999; font-size:0.8rem;">No hay devblogs todavía.</p>'}
                </div>
            </div>
        </div>
    `;
    modal.style.display = "block";
};

// MODAL: Leer un devblog largo
window.abrirDevblogCompleto = function(titulo, contenido, nombreJuego, fecha) {
    const modal = document.getElementById('game-modal');
    const body = document.getElementById('modal-body');

    body.innerHTML = `
        <div class="devblog-lectura" style="padding: 20px;">
            <small style="color:#00ffcc; font-weight:bold; text-transform:uppercase;">${nombreJuego} | ${fecha}</small>
            <h1 style="margin: 15px 0; font-size: 2.2rem; line-height:1.2; color:#333;">${titulo}</h1>
            <hr style="margin-bottom:20px; border:0; border-top:1px solid #eee;">
            <div style="line-height: 1.8; font-size: 1.1rem; color:#333; white-space: pre-line;">
                ${contenido}
            </div>
        </div>
    `;
    modal.style.display = "block";
};

// Función para abrir/cerrar la lista desplegable
window.toggleDevblogs = function(id) {
    const element = document.getElementById(`desplegable-${id}`);
    if (!element) return;
    const isVisible = element.style.display === "flex";
    element.style.display = isVisible ? "none" : "flex";
};

window.cerrarModal = () => {
    document.getElementById('game-modal').style.display = "none";
};

// Cerrar modal al hacer clic fuera
window.onclick = function(event) {
    const modal = document.getElementById('game-modal');
    if (event.target == modal) {
        cerrarModal();
    }
};

// Arrancar la web
document.addEventListener('DOMContentLoaded', cargarHubPrincipal);