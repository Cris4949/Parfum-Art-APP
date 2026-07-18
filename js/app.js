
const $ = id => document.getElementById(id);
const campos = ['businessName','perfumeName','brand','salida','corazon','fondo'];
// Solo estos campos se recuerdan entre sesiones (identidad del negocio y
// preferencia de formato). El resto (perfume, notas, foto) se queda en
// blanco cada vez que se abre la herramienta, para no arrastrar datos
// del último perfume que se generó.
const CAMPOS_PERSISTENTES = ['businessName'];
let formatoActual = 'cuadrado'; // 'cuadrado' | 'story'
let fotoDataUrl = null;          // la que se usa actualmente en la vista previa
let fotoOriginalDataUrl = null;  // la foto tal como se subió, sin procesar
let fotoFondoQuitado = false;

let INVENTARIO = (typeof INVENTARIO_SNAPSHOT !== 'undefined') ? INVENTARIO_SNAPSHOT.slice() : [];

const GITHUB_IMAGENES_BASE = "https://raw.githubusercontent.com/Cris4949/assets-perfumes/main/assets-perfumes/productos/";

// ---------- Conexión en vivo con el Google Sheet ----------
// Para activar esto: en tu Google Sheet ve a Archivo > Compartir > Publicar
// en la web > elige la hoja "Perfumes" > formato CSV > Publicar, y pega
// aquí el link que te da Google.
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSENNDuqtu3lD1HAR-8NDv4c0goBjzn_y-zF3pHRXs3ZFjiF6yzvlVGpSZiIXfX4kVI-dAEMRIYoSAn/pub?gid=0&single=true&output=csv";

function esVerdadero(valor){
  if(typeof valor === 'boolean') return valor;
  const v = (valor || '').toString().trim().toUpperCase();
  return v === 'TRUE' || v === 'VERDADERO' || v === '1' || v === 'SI' || v === 'SÍ';
}

function transformarFilaSheet(row){
  const tipoAroma = row.tipoAroma || '';
  const familias = tipoAroma.split(',').map(f=>f.trim()).filter(Boolean).slice(0,3);
  return {
    nombre: (row.nombre || '').trim(),
    marca: (row.marca || '').trim(),
    imagenArchivo: (row.imagenArchivo || '').trim(),
    aroma: (row.aroma || '').trim(),
    salida: (row.notasSalida || '').trim(),
    corazon: (row.notasCorazon || '').trim(),
    fondo: (row.notasFondo || '').trim(),
    familias: familias,
    agotado: esVerdadero(row.agotado),
  };
}

function cargarInventarioEnVivo(){
  if(!GOOGLE_SHEET_CSV_URL || GOOGLE_SHEET_CSV_URL.indexOf('PEGA_AQUI') === 0){
    // Todavía no se configuró el link del Sheet: seguimos con el snapshot
    // guardado dentro de la app, sin mostrar error (es un estado esperado).
    return;
  }
  if($('estadoInventario')) $('estadoInventario').textContent = 'Actualizando inventario…';
  Papa.parse(GOOGLE_SHEET_CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(resultados){
      const filas = (resultados.data || []).filter(r => r.nombre && r.nombre.trim());
      if(filas.length === 0){
        if($('estadoInventario')){
          $('estadoInventario').textContent = 'No se pudo leer el inventario en vivo; usando la última copia guardada.';
        }
        return;
      }
      INVENTARIO = filas.map(transformarFilaSheet);
      if($('estadoInventario')){
        $('estadoInventario').textContent = `Inventario actualizado en vivo (${INVENTARIO.length} perfumes).`;
      }
      // Si ya había resultados de búsqueda visibles, los refrescamos con los datos nuevos
      const campoBusqueda = $('buscarInventario');
      if(campoBusqueda && campoBusqueda.value.trim().length >= 2){
        mostrarResultados(buscarEnInventario(campoBusqueda.value));
      }
    },
    error: function(){
      if($('estadoInventario')){
        $('estadoInventario').textContent = 'Sin conexión al Sheet; usando la última copia guardada en la app.';
      }
    }
  });
}


// Colores por familia olfativa, en el espíritu de las barras de Fragrantica.
const FAMILIA_COLORES = {
  'Cítrico':              '#E8C93A',
  'Frutal':               '#F2836B',
  'Floral':               '#E37FB3',
  'Dulce':                '#F0A8C4',
  'Gourmand':             '#C98A4B',
  'Amaderado':            '#8A6642',
  'Ambarado':             '#CC9A3C',
  'Oriental':             '#A569D6',
  'Especiado':            '#D97A3D',
  'Aromático':            '#7FAE6B',
  'Fresco':               '#5BC2D6',
  'Acuático':             '#4A90C4',
  'Cuero':                '#7A5240',
  'Variable (multi-aroma)': '#9A93A8',
};
const FAMILIAS_DISPONIBLES = Object.keys(FAMILIA_COLORES);

// ---------- Cargar datos guardados ----------
function cargarGuardado(){
  try{
    const guardado = JSON.parse(localStorage.getItem('piramideOlfativa_parfumart') || '{}');
    CAMPOS_PERSISTENTES.forEach(c => { if(guardado[c]) $(c).value = guardado[c]; });
    if(guardado.formato) formatoActual = guardado.formato;
    // A propósito NO restauramos perfume, marca, precio, notas ni foto:
    // cada apertura de la herramienta arranca en blanco.
  }catch(e){ /* si algo falla, seguimos con campos vacíos */ }
}

function guardar(){
  const data = {};
  CAMPOS_PERSISTENTES.forEach(c => data[c] = $(c).value);
  data.formato = formatoActual;
  try{ localStorage.setItem('piramideOlfativa_parfumart', JSON.stringify(data)); }catch(e){
    // si falla el guardado local, no es grave: solo no se recordará la próxima vez
  }
}

// ---------- Actualizar vista previa ----------
function listaNotas(texto){
  return texto.split(',').map(s=>s.trim()).filter(Boolean).join(' · ');
}

function actualizarPreview(){
  const nombre = $('perfumeName').value.trim() || 'Nombre del perfume';
  const marca = $('brand').value.trim() || 'MARCA';
  const negocio = $('businessName').value.trim() || 'Parfum Art';

  $('pv-brand').textContent = marca.toUpperCase();
  $('pv-nombre').textContent = nombre;
  $('pv-watermark-texto').textContent = negocio.toUpperCase();

  // notas
  $('pv-salida').textContent = listaNotas($('salida').value) || '—';
  $('pv-corazon').textContent = listaNotas($('corazon').value) || '—';
  $('pv-fondo').textContent = listaNotas($('fondo').value) || '—';

  // tamaño dinámico del nombre según longitud
  const nombreEl = $('pv-nombre');
  nombreEl.classList.remove('xl','l','m','s');
  const len = nombre.length;
  if(len <= 12) nombreEl.classList.add('xl');
  else if(len <= 22) nombreEl.classList.add('l');
  else if(len <= 34) nombreEl.classList.add('m');
  else nombreEl.classList.add('s');

  // foto
  if(fotoDataUrl){
    $('pv-bottle').src = fotoDataUrl;
    $('pv-bottle').style.display = 'block';
    $('card').classList.add('con-foto');
  } else {
    $('pv-bottle').style.display = 'none';
    $('card').classList.remove('con-foto');
  }

  // familias olfativas
  const familiasElegidas = [$('familia1').value, $('familia2').value, $('familia3').value]
    .filter(f => f && FAMILIA_COLORES[f]);
  if(familiasElegidas.length){
    $('pv-familias').style.display = 'block';
    $('pv-familias-barra').innerHTML = familiasElegidas
      .map(f => `<span class="familia-segmento" style="background:${FAMILIA_COLORES[f]}"></span>`)
      .join('');
    $('pv-familias-etiquetas').innerHTML = familiasElegidas
      .map(f => `<span style="color:${FAMILIA_COLORES[f]}">${f}</span>`)
      .join('<span class="separador">·</span>');
  } else {
    $('pv-familias').style.display = 'none';
  }

  ajustarAutoFit();
}

// Reduce progresivamente el tamaño de los textos y espacios de la tarjeta
// (vía la variable --escala) hasta que todo el contenido quepa sin
// recortarse, sin importar cuántas notas o qué tan largo sea el nombre.
function ajustarAutoFit(){
  const card = $('card');
  const ESCALA_MAX = 1;
  const ESCALA_MIN = 0.62;
  const PASO = 0.03;

  card.style.setProperty('--escala', ESCALA_MAX);
  let escala = ESCALA_MAX;
  let intentos = 0;

  while(card.scrollHeight > card.clientHeight + 1 && escala > ESCALA_MIN && intentos < 30){
    escala = Math.max(ESCALA_MIN, escala - PASO);
    card.style.setProperty('--escala', escala);
    intentos++;
  }
}

// ---------- Validación de errores ----------
function limpiarErrores(){
  ['perfumeName','brand','salida','corazon','fondo'].forEach(c=>{
    $(c).classList.remove('campo-error');
    $('err-'+c).classList.remove('visible');
  });
}

function validar(){
  limpiarErrores();
  const requeridos = ['perfumeName','brand','salida','corazon','fondo'];
  let ok = true;
  requeridos.forEach(c=>{
    if(!$(c).value.trim()){
      $(c).classList.add('campo-error');
      $('err-'+c).classList.add('visible');
      ok = false;
    }
  });
  return ok;
}

// ---------- Formato ----------
function setFormato(formato){
  formatoActual = formato;
  $('card').classList.toggle('formato-story', formato==='story');
  $('btnCuadrado').classList.toggle('activo', formato==='cuadrado');
  $('btnStory').classList.toggle('activo', formato==='story');
  ajustarAutoFit();
  guardar();
}
$('btnCuadrado').addEventListener('click', ()=>setFormato('cuadrado'));
$('btnStory').addEventListener('click', ()=>setFormato('story'));

// ---------- Panel de detalles colapsable ----------
function setDetallesAbierto(abierto){
  $('detallesPanel').classList.toggle('abierto', abierto);
  $('btnToggleDetalles').classList.toggle('abierto', abierto);
}
$('btnToggleDetalles').addEventListener('click', ()=>{
  const abierto = $('detallesPanel').classList.contains('abierto');
  setDetallesAbierto(!abierto);
});

// ---------- Buscador de inventario ----------
function normalizar(texto){
  return (texto || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quita tildes
}

function buscarEnInventario(consulta){
  const q = normalizar(consulta);
  if(!q) return [];
  return INVENTARIO.filter(p => normalizar(p.nombre).includes(q) || normalizar(p.marca).includes(q));
}

function renderItem(p){
  return `
    <div class="resultado-item" data-indice="${INVENTARIO.indexOf(p)}">
      <img src="${GITHUB_IMAGENES_BASE}${encodeURIComponent(p.imagenArchivo || '')}" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="resultado-texto">
        <div class="resultado-nombre">${p.nombre}</div>
        <div class="resultado-detalle">${p.marca}</div>
      </div>
    </div>
  `;
}

function mostrarResultados(lista){
  const cont = $('resultadosInventario');
  const LIMITE = 6;
  const mensajeVacio = '<div class="resultado-vacio" id="resultadoVacioAbrir">No encontramos ese perfume en tu inventario.<br><strong>Toca aquí para agregarlo a mano</strong> — funciona igual.</div>';

  if(lista.length === 0){
    cont.innerHTML = mensajeVacio;
    cont.classList.add('visible');
    $('resultadoVacioAbrir').addEventListener('click', ()=>{
      setDetallesAbierto(true);
      $('perfumeName').focus();
      cont.classList.remove('visible');
    });
    return;
  }

  const enStock = lista.filter(p => !p.agotado);
  const agotados = lista.filter(p => p.agotado);

  let html = '';
  if(enStock.length){
    html += `<div class="resultado-seccion">En stock</div>`;
    html += enStock.slice(0, LIMITE).map(renderItem).join('');
    if(enStock.length > LIMITE){
      html += `<div class="resultado-mas">+${enStock.length - LIMITE} más — sigue escribiendo para afinar la búsqueda</div>`;
    }
  }
  if(agotados.length){
    html += `<div class="resultado-seccion resultado-seccion-agotados">Agotados</div>`;
    html += agotados.slice(0, LIMITE).map(renderItem).join('');
    if(agotados.length > LIMITE){
      html += `<div class="resultado-mas">+${agotados.length - LIMITE} más — sigue escribiendo para afinar la búsqueda</div>`;
    }
  }
  if(!enStock.length && !agotados.length){
    html = mensajeVacio;
  }

  cont.innerHTML = html;
  cont.classList.add('visible');

  cont.querySelectorAll('.resultado-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const perfume = INVENTARIO[parseInt(el.dataset.indice, 10)];
      seleccionarDelInventario(perfume);
    });
  });
}

async function seleccionarDelInventario(perfume){
  $('buscarInventario').value = perfume.nombre;
  $('resultadosInventario').classList.remove('visible');
  let huboProblema = false;

  $('perfumeName').value = perfume.nombre || '';
  $('brand').value = perfume.marca || '';

  const mensajeAgotado = perfume.agotado ? 'Este perfume está marcado como agotado en tu inventario.' : '';
  $('ayudaInventario').textContent = mensajeAgotado;
  $('ayudaInventario').style.color = perfume.agotado ? 'var(--error)' : '#8a7a9c';

  const familias = Array.isArray(perfume.familias) ? perfume.familias : [];
  $('familia1').value = familias[0] || '';
  $('familia2').value = familias[1] || '';
  $('familia3').value = familias[2] || '';

  const tieneNotasDivididas = perfume.salida && perfume.corazon && perfume.fondo;
  if(tieneNotasDivididas){
    $('salida').value = perfume.salida;
    $('corazon').value = perfume.corazon;
    $('fondo').value = perfume.fondo;
    $('aromaHint').style.display = 'none';
  } else {
    $('salida').value = '';
    $('corazon').value = '';
    $('fondo').value = '';
    huboProblema = true;
    if(perfume.aroma){
      $('aromaHint').style.display = 'block';
      $('aromaHint').textContent = 'Este perfume no tiene notas divididas todavía. Descripción de referencia: "' + perfume.aroma + '" — repártela en los 3 campos de abajo.';
    }
  }

  limpiarErrores();

  if(perfume.imagenArchivo){
    $('ayudaInventario').textContent = (mensajeAgotado ? mensajeAgotado + ' ' : '') + 'Cargando foto y quitando el fondo…';
    try{
      const url = GITHUB_IMAGENES_BASE + encodeURIComponent(perfume.imagenArchivo);
      const dataUrl = await cargarImagenComoDataURL(url);
      const exito = await procesarFotoNueva(dataUrl);
      $('ayudaInventario').textContent = mensajeAgotado
        + (exito ? '' : (mensajeAgotado ? ' ' : '') + 'No se pudo quitar el fondo automáticamente; se dejó la foto original.');
      $('ayudaInventario').style.color = (perfume.agotado || !exito) ? 'var(--error)' : '#8a7a9c';
      if(!exito) huboProblema = true;
    }catch(e){
      $('ayudaInventario').textContent = (mensajeAgotado ? mensajeAgotado + ' ' : '') + 'No se pudo cargar la foto automáticamente (revisa tu conexión o que el repositorio sea público). Puedes subirla a mano abajo.';
      $('ayudaInventario').style.color = 'var(--error)';
      huboProblema = true;
    }
  }

  if(huboProblema) setDetallesAbierto(true);

  actualizarPreview();
  guardar();
}

function cargarImagenComoDataURL(url){
  return new Promise((resolve, reject)=>{
    fetch(url, {mode:'cors'})
      .then(resp => {
        if(!resp.ok) throw new Error('No se pudo descargar la imagen');
        return resp.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(blob);
      })
      .catch(reject);
  });
}

let buscarInventarioTimeout = null;
$('buscarInventario').addEventListener('input', (e)=>{
  clearTimeout(buscarInventarioTimeout);
  const valor = e.target.value;
  buscarInventarioTimeout = setTimeout(()=>{
    if(valor.trim().length < 2){
      $('resultadosInventario').classList.remove('visible');
      return;
    }
    mostrarResultados(buscarEnInventario(valor));
  }, 150);
});
$('buscarInventario').addEventListener('focus', (e)=>{
  if(e.target.value.trim().length >= 2){
    mostrarResultados(buscarEnInventario(e.target.value));
  }
});
document.addEventListener('click', (e)=>{
  if(!e.target.closest('#buscarInventario') && !e.target.closest('#resultadosInventario')){
    $('resultadosInventario').classList.remove('visible');
  }
});

// ---------- Foto ----------
$('fotoBtn').addEventListener('click', ()=> $('fotoInput').click());
$('fotoInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (ev)=>{
    $('ayudaFoto').textContent = 'Quitando el fondo automáticamente…';
    const exito = await procesarFotoNueva(ev.target.result);
    $('ayudaFoto').textContent = exito
      ? 'Fondo quitado automáticamente. Funciona mejor con fotos de fondo liso — si no quedó bien, puedes restaurar la foto original.'
      : 'No se pudo quitar el fondo de esta foto automáticamente. Se mantiene la original.';
    actualizarPreview();
    guardar();
  };
  reader.readAsDataURL(file);
});

// Quita el fondo detectando el color de las esquinas y "derramando" desde
// los bordes: vuelve transparente todo lo conectado al borde con un color
// parecido. Funciona bien con fotos de fondo liso (blanco, gris, etc.);
// con fondos con textura o varios colores el resultado puede ser parcial.
function quitarFondoCanvas(dataUrl){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      const maxDim = 900;
      const escalaReduccion = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * escalaReduccion);
      const h = Math.round(img.height * escalaReduccion);

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      function pixelAt(x,y){ const i=(y*w+x)*4; return [data[i],data[i+1],data[i+2]]; }
      const esquinas = [pixelAt(0,0), pixelAt(w-1,0), pixelAt(0,h-1), pixelAt(w-1,h-1)];
      const bg = [0,1,2].map(k => Math.round(esquinas.reduce((s,p)=>s+p[k],0)/4));
      const umbral = 42;

      function distancia(i){
        const dr=data[i]-bg[0], dg=data[i+1]-bg[1], db=data[i+2]-bg[2];
        return Math.sqrt(dr*dr+dg*dg+db*db);
      }

      const visitado = new Uint8Array(w*h);
      const pila = [];
      for(let x=0;x<w;x++){ pila.push(x,0); pila.push(x,h-1); }
      for(let y=0;y<h;y++){ pila.push(0,y); pila.push(w-1,y); }

      while(pila.length){
        const y = pila.pop();
        const x = pila.pop();
        if(x<0||y<0||x>=w||y>=h) continue;
        const idx = y*w+x;
        if(visitado[idx]) continue;
        visitado[idx] = 1;
        const i = idx*4;
        if(distancia(i) <= umbral){
          data[i+3] = 0;
          pila.push(x+1,y, x-1,y, x,y+1, x,y-1);
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = ()=> reject(new Error('No se pudo procesar la imagen'));
    img.src = dataUrl;
  });
}

// Recibe una foto recién obtenida (subida a mano o descargada del
// inventario), le quita el fondo automáticamente y deja todo listo en la
// vista previa. Devuelve true/false según si el quitado de fondo funcionó
// (si falla, se conserva la foto original igual, solo sin procesar).
async function procesarFotoNueva(dataUrlOriginal){
  fotoOriginalDataUrl = dataUrlOriginal;
  $('btnQuitarFondo').style.display = 'block';
  let exito = true;
  try{
    const resultado = await quitarFondoCanvas(dataUrlOriginal);
    fotoDataUrl = resultado;
    fotoFondoQuitado = true;
    $('btnQuitarFondo').textContent = 'Restaurar foto original';
  }catch(e){
    fotoDataUrl = dataUrlOriginal;
    fotoFondoQuitado = false;
    $('btnQuitarFondo').textContent = 'Quitar fondo (automático)';
    exito = false;
  }
  $('fotoPreviewMini').src = fotoDataUrl;
  $('fotoPreviewMini').style.display = 'block';
  $('fotoBtnTexto').textContent = 'Foto lista — toca para cambiarla';
  return exito;
}

$('btnQuitarFondo').addEventListener('click', async ()=>{
  if(!fotoOriginalDataUrl) return;
  if(!fotoFondoQuitado){
    $('ayudaFoto').textContent = 'Quitando el fondo…';
    try{
      const resultado = await quitarFondoCanvas(fotoOriginalDataUrl);
      fotoDataUrl = resultado;
      fotoFondoQuitado = true;
      $('btnQuitarFondo').textContent = 'Restaurar foto original';
      $('ayudaFoto').textContent = 'Fondo quitado. Funciona mejor con fotos de fondo liso — si no quedó bien, puedes restaurar la foto original.';
    }catch(e){
      $('ayudaFoto').textContent = 'No se pudo quitar el fondo de esta foto. Se mantiene la original.';
    }
  } else {
    fotoDataUrl = fotoOriginalDataUrl;
    fotoFondoQuitado = false;
    $('btnQuitarFondo').textContent = 'Quitar fondo (automático)';
    $('ayudaFoto').textContent = '';
  }
  actualizarPreview();
  guardar();
});

// ---------- Reiniciar ----------
$('btnReiniciar').addEventListener('click', ()=>{
  if(!confirm('¿Borrar todos los campos y empezar de nuevo?')) return;
  ['perfumeName','brand','salida','corazon','fondo'].forEach(c => $(c).value='');
  $('familia1').value = '';
  $('familia2').value = '';
  $('familia3').value = '';
  fotoDataUrl = null;
  fotoOriginalDataUrl = null;
  fotoFondoQuitado = false;
  $('fotoPreviewMini').style.display='none';
  $('fotoBtnTexto').textContent = 'Toca para subir una foto';
  $('btnQuitarFondo').style.display = 'none';
  $('ayudaFoto').textContent = '';
  limpiarErrores();
  actualizarPreview();
  guardar();
});

// ---------- Exportar imagen ----------
async function esperarFuentes(){
  if(document.fonts && document.fonts.ready){
    await document.fonts.ready;
  }
}

async function generarImagen(){
  const escala = 3;
  const anchoObjetivo = formatoActual === 'story' ? 1080 : 1080;
  const nodo = $('card');
  const canvas = await html2canvas(nodo, {
    scale: escala,
    backgroundColor: null,
    useCORS: true
  });
  return canvas;
}

$('btnDescargar').addEventListener('click', async ()=>{
  if(!validar()){
    setDetallesAbierto(true);
    $('ayudaExport').textContent = 'Revisa los campos marcados en rojo antes de descargar.';
    $('ayudaExport').style.color = 'var(--error)';
    return;
  }
  $('ayudaExport').style.color = '#8a7a9c';
  $('ayudaExport').textContent = 'Generando imagen…';
  try{
    await esperarFuentes();
    const canvas = await generarImagen();
    const enlace = document.createElement('a');
    const nombreArchivo = ($('perfumeName').value.trim() || 'perfume').replace(/\s+/g,'_');
    enlace.download = `piramide_${nombreArchivo}.png`;
    enlace.href = canvas.toDataURL('image/png');
    enlace.click();
    $('ayudaExport').textContent = 'Imagen descargada.';
  }catch(err){
    $('ayudaExport').style.color = 'var(--error)';
    $('ayudaExport').textContent = 'No se pudo generar la imagen. Intenta de nuevo.';
  }
});

$('btnCompartir').addEventListener('click', async ()=>{
  if(!validar()){
    setDetallesAbierto(true);
    $('ayudaExport').textContent = 'Revisa los campos marcados en rojo antes de compartir.';
    $('ayudaExport').style.color = 'var(--error)';
    return;
  }
  $('ayudaExport').style.color = '#8a7a9c';
  $('ayudaExport').textContent = 'Preparando imagen para compartir…';
  try{
    await esperarFuentes();
    const canvas = await generarImagen();
    canvas.toBlob(async (blob)=>{
      const nombreArchivo = ($('perfumeName').value.trim() || 'perfume').replace(/\s+/g,'_');
      const file = new File([blob], `piramide_${nombreArchivo}.png`, {type:'image/png'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        try{
          await navigator.share({files:[file], title: $('perfumeName').value || 'Pirámide olfativa'});
          $('ayudaExport').textContent = '';
        }catch(e){
          // usuario canceló el share, no es un error real
          $('ayudaExport').textContent = '';
        }
      } else {
        $('ayudaExport').style.color = 'var(--error)';
        $('ayudaExport').textContent = 'Este navegador no permite compartir directo. Usa "Descargar imagen" y compártela desde tus fotos.';
      }
    }, 'image/png');
  }catch(err){
    $('ayudaExport').style.color = 'var(--error)';
    $('ayudaExport').textContent = 'No se pudo preparar la imagen para compartir.';
  }
});

// ---------- Eventos de entrada (vista en vivo + autoguardado) ----------
campos.forEach(c=>{
  $(c).addEventListener('input', ()=>{
    actualizarPreview();
    guardar();
  });
});
['familia1','familia2','familia3'].forEach(id=>{
  $(id).addEventListener('change', ()=>{
    actualizarPreview();
    guardar();
  });
});

// ---------- Inicio ----------
$('pv-watermark-logo').src = 'assets/logo-parfumart.png';

// Poblar los 3 selectores de familia olfativa con las opciones disponibles
['familia1','familia2','familia3'].forEach(id=>{
  const select = $(id);
  const vacia = document.createElement('option');
  vacia.value = '';
  vacia.textContent = '—';
  select.appendChild(vacia);
  FAMILIAS_DISPONIBLES.forEach(familia=>{
    const opt = document.createElement('option');
    opt.value = familia;
    opt.textContent = familia;
    select.appendChild(opt);
  });
});

cargarGuardado();
if(!$('businessName').value.trim()){
  $('businessName').value = 'Parfum Art';
}
setFormato(formatoActual);
actualizarPreview();
cargarInventarioEnVivo();

