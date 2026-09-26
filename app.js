/**
 * Buzón Mágico - Lógica de Sobres 3D y Bloc de Notas
 */

(function () {
  'use strict';

  // Constantes y claves de almacenamiento
  const STORAGE_KEY = 'magic_envelopes_cartas_v2';
  
  const COLOR_NAMES = {
    kraft: 'Papel Craft',
    rose: 'Rosa Pastel',
    lavender: 'Lavanda',
    mint: 'Menta Suave',
    sky: 'Azul Cielo',
    terracotta: 'Terracota',
    noir: 'Gris Carbón'
  };

  // Referencia a Firebase Realtime Database
  let dbRef = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.database) {
      dbRef = firebase.database().ref('cartas');
    }
  } catch (err) {
    console.warn('Firebase no inicializado aún:', err);
  }

  // No hay sobres ficticios ni de prueba: el buzón empieza completamente limpio
  const INITIAL_ENVELOPES = [];

  // Estado de la aplicación
  let envelopes = [];
  let currentEnvelopeId = null;
  let saveTimeout = null;

  // Elementos del DOM
  const gridEl = document.getElementById('envelopes-grid');
  const template = document.getElementById('envelope-card-template');
  const btnNewEnvelope = document.getElementById('btn-new-envelope');
  const cloudStatus = document.getElementById('cloud-status');

  // Modal y componentes del sobre abierto
  const noteModal = document.getElementById('note-modal');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const modalEnvelopeContainer = document.getElementById('modal-envelope-container');
  const notepadSheet = document.getElementById('notepad-sheet');
  const noteAuthorInput = document.getElementById('note-author-input');
  const noteTitleInput = document.getElementById('note-title-input');
  const noteTextInput = document.getElementById('note-text-input');
  const noteDateDisplay = document.getElementById('note-date-display');
  const noteColorBadge = document.getElementById('note-color-badge');
  const saveStatus = document.getElementById('save-status');
  const imagesContainer = document.getElementById('images-container');
  const imageFileInput = document.getElementById('image-file-input');
  const dropHintBar = document.getElementById('drop-hint-bar');

  // Botones de acción del bloc
  const btnCloseNote = document.getElementById('btn-close-note');
  const btnDoneNote = document.getElementById('btn-done-note');
  const btnDeleteNote = document.getElementById('btn-delete-note');
  const btnAddLink = document.getElementById('btn-add-link');
  const btnToggleView = document.getElementById('btn-toggle-view');
  const btnDownloadNote = document.getElementById('btn-download-note');
  const viewToggleIcon = document.getElementById('view-toggle-icon');
  const viewToggleText = document.getElementById('view-toggle-text');
  const noteTextDisplay = document.getElementById('note-text-display');
  const noteLinksContainer = document.getElementById('note-links-container');
  const noteLinksList = document.getElementById('note-links-list');

  // Botón de cabecera para descargar álbum
  const btnDownloadAlbum = document.getElementById('btn-download-album');

  // Modal para insertar enlace
  const linkModal = document.getElementById('link-modal');
  const linkModalBackdrop = document.getElementById('link-modal-backdrop');
  const btnCloseLinkModal = document.getElementById('btn-close-link-modal');
  const btnCancelLink = document.getElementById('btn-cancel-link');
  const btnConfirmLink = document.getElementById('btn-confirm-link');
  const linkUrlInput = document.getElementById('link-url-input');
  const linkTitleInput = document.getElementById('link-title-input');
  const linkModalError = document.getElementById('link-modal-error');

  // Selector de color
  const colorDropdownBtn = document.getElementById('color-dropdown-btn');
  const colorPalettePopover = document.getElementById('color-palette-popover');
  const currentColorDot = document.getElementById('current-color-dot');

  // Visor de imágenes ampliadas
  const imageViewerModal = document.getElementById('image-viewer-modal');
  const imageViewerImg = document.getElementById('image-viewer-img');
  const btnCloseImageViewer = document.getElementById('btn-close-image-viewer');
  const btnDownloadViewerImage = document.getElementById('btn-download-viewer-image');

  // Contenedor de Toasts
  const toastContainer = document.getElementById('toast-container');
  let currentViewerImageSrc = '';

  // Modal de compartir para cumpleaños
  const btnShareGuide = document.getElementById('btn-share-guide');
  const shareModal = document.getElementById('share-modal');
  const shareModalBackdrop = document.getElementById('share-modal-backdrop');
  const btnCloseShare = document.getElementById('btn-close-share');
  const btnSaveWebLetters = document.getElementById('btn-save-web-letters');
  const saveWebFeedback = document.getElementById('save-web-feedback');

  // -------------------------------------------------------------------------
  // Inicialización y Carga en Tiempo Real con Firebase
  // -------------------------------------------------------------------------
  async function init() {
    setupEventListeners();

    if (dbRef) {
      if (cloudStatus) cloudStatus.style.display = 'inline-flex';
      // Escuchar cambios en la nube en tiempo real
      dbRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
          const list = [];
          snapshot.forEach((child) => {
            list.push({ id: child.key, ...child.val() });
          });
          list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          envelopes = list;
        } else {
          // Si la base de datos está vacía, no forzar recreación de sobres eliminados
          envelopes = [];
        }
        persistEnvelopes();
        renderGrid();
      }, (error) => {
        console.warn('Error al conectar con Firebase Realtime Database:', error);
        loadLocalFallback();
      });
    } else {
      await loadLocalFallback();
    }
  }

  async function loadLocalFallback() {
    try {
      const res = await fetch('./cartas_cumpleanos.json');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          envelopes = data;
          persistEnvelopes();
          renderGrid();
          return;
        }
      }
    } catch (e) {
      // continuar a localStorage
    }

    try {
      const data = localStorage.getItem(STORAGE_KEY);
      envelopes = data ? JSON.parse(data) : INITIAL_ENVELOPES;
    } catch (e) {
      envelopes = INITIAL_ENVELOPES;
    }
    renderGrid();
  }

  function persistEnvelopes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelopes));
    } catch (e) {
      console.error('Error al guardar en localStorage:', e);
      if (e.name === 'QuotaExceededError') {
        alert('El almacenamiento local está lleno. Considera eliminar algunas imágenes grandes.');
      }
    }
  }

  function formatDate(timestamp) {
    const d = new Date(timestamp);
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  // -------------------------------------------------------------------------
  // Renderizado de la Cuadrícula de Sobres
  // -------------------------------------------------------------------------
  let renderGridTimer = null;
  function renderGrid() {
    if (renderGridTimer) return; // ya hay un render pendiente, no duplicar
    renderGridTimer = requestAnimationFrame(() => {
      renderGridTimer = null;
      _doRenderGrid();
    });
  }

  function _doRenderGrid() {
    gridEl.innerHTML = '';
    if (envelopes.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.innerHTML = `
        <div class="empty-state-icon">📭</div>
        <h3>Tu buzón está vacío</h3>
        <p>No tienes ningún sobre de notas todavía. Haz clic en "Nuevo Sobre" para crear el primero.</p>
        <button id="btn-empty-create" class="btn-primary">✉️ Crear mi primer sobre</button>
      `;
      gridEl.appendChild(emptyDiv);

      document.getElementById('btn-empty-create').addEventListener('click', () => {
        createNewEnvelope();
      });
      return;
    }

    envelopes.forEach((env) => {
      const clone = template.content.cloneNode(true);
      const itemEl = clone.querySelector('.envelope-item');
      const cardEl = clone.querySelector('.envelope-card');
      const titleEl = clone.querySelector('.card-title');
      const dateEl = clone.querySelector('.card-date');
      const imgNumEl = clone.querySelector('.img-num');

      // Aplicar tema de color
      cardEl.classList.add(`theme-${env.theme || 'kraft'}`);

      // Datos de texto
      const authorEl = clone.querySelector('.card-author');
      if (authorEl) {
        authorEl.textContent = env.author ? (env.author.toLowerCase().startsWith('de:') ? env.author : `De: ${env.author}`) : 'De: Alguien especial';
      }
      titleEl.textContent = env.title.trim() || 'Sobre para Jenni';
      dateEl.textContent = formatDate(env.updatedAt);

      // Contador de imágenes y enlaces
      const previewEl = clone.querySelector('.card-preview-count');
      const imageTagEl = clone.querySelector('.image-count-tag');
      const imgCount = (env.images && env.images.length) || 0;
      if (imgCount > 0 && imageTagEl && imgNumEl) {
        imageTagEl.style.display = 'inline-flex';
        imgNumEl.textContent = imgCount;
      }

      const linkTagEl = clone.querySelector('.link-count-tag');
      const linkNumEl = clone.querySelector('.link-num');
      const attachedCount = (env.links && env.links.length) || 0;
      const textLinksCount = extractLinks(env.content || '').filter(
        (tl) => !((env.links || []).some((al) => (al.url || '').toLowerCase() === tl.toLowerCase()))
      ).length;
      const linksCount = attachedCount + textLinksCount;
      if (linksCount > 0 && linkTagEl && linkNumEl) {
        linkTagEl.style.display = 'inline-flex';
        linkNumEl.textContent = linksCount;
      }

      if (imgCount === 0 && linksCount === 0 && previewEl) {
        previewEl.style.display = 'none';
      }

      // Evento de clic para abrir el sobre
      itemEl.addEventListener('click', () => {
        openEnvelope(env.id);
      });

      itemEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openEnvelope(env.id);
        }
      });

      gridEl.appendChild(clone);
    });
  }

  // -------------------------------------------------------------------------
  // Animación de Apertura y Cierre de Sobre
  // -------------------------------------------------------------------------
  function openEnvelope(id) {
    const env = envelopes.find((e) => e.id === id);
    if (!env) return;

    currentEnvelopeId = id;

    // Rellenar campos del modal
    if (noteAuthorInput) noteAuthorInput.value = env.author || '';
    noteTitleInput.value = env.title || '';
    noteTextInput.value = env.content || '';
    noteDateDisplay.textContent = formatDate(env.updatedAt);
    applyModalTheme(env.theme || 'kraft');

    // Renderizar imágenes adjuntas
    renderImages(env.images || []);

    // Restablecer modo edición y renderizar sección de enlaces adjuntos
    setReadingMode(false);
    renderLinksSection(env);

    // Preparar estado del guardado
    updateSaveIndicator('Guardado');

    // Desplegar modal con efecto
    noteModal.setAttribute('aria-hidden', 'false');
    noteModal.classList.add('active');

    // Confeti festivo al abrir carta de cumpleaños
    if (typeof confetti === 'function') {
      try {
        confetti({
          particleCount: 55,
          spread: 65,
          origin: { y: 0.6 }
        });
      } catch (err) {
        // Ignorar si confetti falla
      }
    }

    // Dar foco al autor o título
    setTimeout(() => {
      if (noteAuthorInput && !noteAuthorInput.value) {
        noteAuthorInput.focus();
      } else if (!env.title) {
        noteTitleInput.focus();
      }
    }, 450);
  }

  function closeEnvelope() {
    if (!currentEnvelopeId) return;

    // Guardar cambios inmediatamente antes de cerrar
    saveCurrentDataImmediately();

    // Cerrar modal de enlace si estaba abierto
    closeLinkModal();

    // Animación de cierre
    noteModal.classList.remove('active');
    noteModal.setAttribute('aria-hidden', 'true');
    colorPalettePopover.classList.remove('show');

    setTimeout(() => {
      currentEnvelopeId = null;
      renderGrid();
    }, 400);
  }

  const COLOR_HEX = {
    kraft: '#ddbf96',
    rose: '#f8ccd2',
    lavender: '#d7cdfc',
    mint: '#c1ebd5',
    sky: '#c3e2fa',
    terracotta: '#f2ae94',
    noir: '#43444e'
  };

  function applyModalTheme(theme) {
    // Quitar temas anteriores
    Object.keys(COLOR_NAMES).forEach((t) => {
      modalEnvelopeContainer.classList.remove(`theme-${t}`);
    });
    modalEnvelopeContainer.classList.add(`theme-${theme}`);
    noteColorBadge.textContent = COLOR_NAMES[theme] || 'Sobre';
    currentColorDot.style.backgroundColor = COLOR_HEX[theme] || '#ddbf96';
  }

  // -------------------------------------------------------------------------
  // Creación y Eliminación de Sobres
  // -------------------------------------------------------------------------
  function createNewEnvelope() {
    const themeKeys = Object.keys(COLOR_NAMES);
    const randomTheme = themeKeys[Math.floor(Math.random() * themeKeys.length)];

    const newId = dbRef ? dbRef.push().key : 'env-' + Date.now();
    const newEnv = {
      id: newId,
      author: '',
      title: 'Carta para Jenni',
      content: '',
      images: [],
      links: [],
      theme: randomTheme,
      updatedAt: Date.now()
    };

    envelopes.unshift(newEnv);
    if (dbRef) {
      dbRef.child(newId).set(newEnv);
    }
    persistEnvelopes();
    renderGrid();

    // Abrir automáticamente el nuevo sobre
    openEnvelope(newEnv.id);
  }

  function deleteCurrentEnvelope() {
    if (!currentEnvelopeId) return;

    const confirmDelete = confirm('¿Estás seguro de que deseas eliminar este sobre?');
    if (!confirmDelete) return;

    // Cancelar cualquier autoguardado pendiente para que no reviva el sobre
    clearTimeout(saveTimeout);
    saveTimeout = null;

    const idToDelete = currentEnvelopeId;
    currentEnvelopeId = null; // Anular de inmediato

    if (dbRef) {
      dbRef.child(idToDelete).remove();
    }
    envelopes = envelopes.filter((e) => e.id !== idToDelete);
    persistEnvelopes();

    noteModal.classList.remove('active');
    noteModal.setAttribute('aria-hidden', 'true');

    setTimeout(() => {
      renderGrid();
    }, 350);
  }

  // -------------------------------------------------------------------------
  // Gestión de Texto y Auto-Guardado
  // -------------------------------------------------------------------------
  function queueAutoSave() {
    updateSaveIndicator('Guardando...');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveCurrentDataImmediately();
      updateSaveIndicator('Guardado en la nube');
    }, 600);
  }

  function saveCurrentDataImmediately() {
    if (!currentEnvelopeId) return;

    const env = envelopes.find((e) => e.id === currentEnvelopeId);
    if (!env) return;

    env.author = noteAuthorInput ? noteAuthorInput.value.trim() : '';
    env.title = noteTitleInput.value.trim() || 'Sobre para Jenni';
    env.content = noteTextInput.value;
    env.updatedAt = Date.now();

    if (dbRef) {
      dbRef.child(currentEnvelopeId).set(env);
    }
    persistEnvelopes();
  }

  function updateSaveIndicator(text) {
    if (saveStatus) {
      saveStatus.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
        ${text}
      `;
    }
  }

  // -------------------------------------------------------------------------
  // Gestión de Enlaces y Modo Lectura
  // -------------------------------------------------------------------------
  const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>'"`]+[^\s<>'"`.,;:!?)\]]/gi;

  function extractLinks(text) {
    if (!text) return [];
    const matches = text.match(URL_REGEX) || [];
    const unique = [];
    const seen = new Set();
    matches.forEach((m) => {
      const lower = m.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        unique.push(m);
      }
    });
    return unique;
  }

  function getLinkInfo(rawUrl, customTitle) {
    let url = rawUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    let domain = '';
    try {
      const parsed = new URL(url);
      domain = parsed.hostname.replace(/^www\./, '');
    } catch (e) {
      domain = rawUrl.replace(/^https?:\/\//i, '').split('/')[0];
    }

    let title = customTitle ? customTitle.trim() : domain;
    let icon = '🔗';
    let category = 'Web';

    if (/youtube\.com|youtu\.be/i.test(domain)) {
      icon = '🎬';
      if (!customTitle) title = 'YouTube';
      category = 'Video';
    } else if (/spotify\.com/i.test(domain)) {
      icon = '🎵';
      if (!customTitle) title = 'Spotify';
      category = 'Música';
    } else if (/instagram\.com/i.test(domain)) {
      icon = '📸';
      if (!customTitle) title = 'Instagram';
      category = 'Foto / Reel';
    } else if (/tiktok\.com/i.test(domain)) {
      icon = '📱';
      if (!customTitle) title = 'TikTok';
      category = 'Video';
    } else if (/drive\.google\.com|photos\.google\.com|dropbox\.com/i.test(domain)) {
      icon = '📁';
      if (!customTitle) title = 'Fotos / Archivos';
      category = 'Nube';
    } else if (/pinterest\.com/i.test(domain)) {
      icon = '📌';
      if (!customTitle) title = 'Pinterest';
      category = 'Tablero';
    } else if (/apple\.com\/.*music|music\.apple/i.test(domain)) {
      icon = '🎶';
      if (!customTitle) title = 'Apple Music';
      category = 'Música';
    } else if (/twitter\.com|x\.com/i.test(domain)) {
      icon = '🐦';
      if (!customTitle) title = 'X (Twitter)';
      category = 'Red Social';
    }

    return { rawUrl, url, domain, title, icon, category };
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  let isReadingMode = false;

  function setReadingMode(reading) {
    isReadingMode = reading;
    if (!noteTextDisplay || !noteTextInput) return;

    if (isReadingMode) {
      renderFormattedContent();
      noteTextInput.style.display = 'none';
      noteTextDisplay.style.display = 'block';
      if (btnToggleView) {
        btnToggleView.classList.add('active');
        if (viewToggleIcon) viewToggleIcon.textContent = '✏️';
        if (viewToggleText) viewToggleText.textContent = 'Editar';
      }
    } else {
      noteTextDisplay.style.display = 'none';
      noteTextInput.style.display = 'block';
      if (btnToggleView) {
        btnToggleView.classList.remove('active');
        if (viewToggleIcon) viewToggleIcon.textContent = '👁️';
        if (viewToggleText) viewToggleText.textContent = 'Leer';
      }
    }
  }

  function renderFormattedContent() {
    if (!noteTextDisplay || !noteTextInput) return;
    const raw = noteTextInput.value;
    if (!raw.trim()) {
      noteTextDisplay.innerHTML = '<span style="color: #bfa993; font-style: italic;">Esta carta aún no tiene texto escrito. Haz clic en "Editar" para escribir.</span>';
      return;
    }

    const escaped = escapeHtml(raw);
    const withLinks = escaped.replace(URL_REGEX, (match) => {
      const fullUrl = /^https?:\/\//i.test(match) ? match : 'https://' + match;
      return `<a href="${fullUrl}" target="_blank" rel="noopener noreferrer" class="inline-link" title="Abrir enlace en nueva pestaña">${match}</a>`;
    });
    noteTextDisplay.innerHTML = withLinks.replace(/\n/g, '<br>');
  }

  function renderLinksSection(envParam) {
    if (!noteLinksContainer || !noteLinksList) return;
    const env = (envParam && typeof envParam === 'object' && envParam.id)
      ? envParam
      : (currentEnvelopeId ? envelopes.find((e) => e.id === currentEnvelopeId) : null);

    const attachedLinks = (env && Array.isArray(env.links)) ? env.links : [];

    const textContent = noteTextInput ? noteTextInput.value : (env ? env.content : '');
    const textLinks = extractLinks(textContent || '');
    const extraTextLinks = textLinks.filter(
      (tl) => !attachedLinks.some((al) => (al.url || '').toLowerCase() === tl.toLowerCase())
    );

    const totalCount = attachedLinks.length + extraTextLinks.length;
    if (totalCount === 0) {
      noteLinksContainer.style.display = 'none';
      noteLinksList.innerHTML = '';
      return;
    }

    noteLinksContainer.style.display = 'block';
    noteLinksList.innerHTML = '';

    // Enlaces adjuntos mediante el botón "Añadir Enlace" (con botón para eliminar)
    attachedLinks.forEach((item, index) => {
      const info = getLinkInfo(item.url, item.title);
      const pill = document.createElement('div');
      pill.className = 'link-card-pill';

      pill.innerHTML = `
        <a href="${info.url}" target="_blank" rel="noopener noreferrer" class="link-pill-link" title="Abrir ${info.url} en nueva pestaña">
          <div class="link-pill-main">
            <span class="link-pill-icon">${info.icon}</span>
            <div class="link-pill-text-col">
              <span class="link-pill-title">${escapeHtml(info.title)}</span>
              <span class="link-pill-url">${escapeHtml(info.url)}</span>
            </div>
          </div>
          <span class="link-pill-action">
            Abrir ↗
          </span>
        </a>
        <button type="button" class="btn-remove-link" title="Eliminar este enlace">✕</button>
      `;

      const btnRemove = pill.querySelector('.btn-remove-link');
      if (btnRemove) {
        btnRemove.addEventListener('click', (e) => {
          e.stopPropagation();
          removeLinkAtIndex(index);
        });
      }

      noteLinksList.appendChild(pill);
    });

    // Enlaces adicionales detectados en el texto (si los hubiera)
    extraTextLinks.forEach((rawUrl) => {
      const info = getLinkInfo(rawUrl);
      const pill = document.createElement('div');
      pill.className = 'link-card-pill';

      pill.innerHTML = `
        <a href="${info.url}" target="_blank" rel="noopener noreferrer" class="link-pill-link" title="Abrir ${info.url} en nueva pestaña">
          <div class="link-pill-main">
            <span class="link-pill-icon">${info.icon}</span>
            <div class="link-pill-text-col">
              <span class="link-pill-title">${escapeHtml(info.title)}</span>
              <span class="link-pill-url">${escapeHtml(info.url)}</span>
            </div>
          </div>
          <span class="link-pill-action">
            Abrir ↗
          </span>
        </a>
      `;

      noteLinksList.appendChild(pill);
    });
  }

  function openLinkModal() {
    if (!linkModal) return;
    if (linkUrlInput) linkUrlInput.value = '';
    if (linkTitleInput) linkTitleInput.value = '';
    if (linkModalError) {
      linkModalError.textContent = '';
      linkModalError.style.display = 'none';
    }
    linkModal.style.display = 'flex';
    linkModal.setAttribute('aria-hidden', 'false');
    setTimeout(() => {
      if (linkUrlInput) linkUrlInput.focus();
    }, 100);
  }

  function closeLinkModal() {
    if (!linkModal) return;
    linkModal.style.display = 'none';
    linkModal.setAttribute('aria-hidden', 'true');
  }

  function handleConfirmLink() {
    const rawUrl = (linkUrlInput ? linkUrlInput.value : '').trim();
    const title = (linkTitleInput ? linkTitleInput.value : '').trim();

    if (!rawUrl) {
      if (linkModalError) {
        linkModalError.textContent = 'Por favor ingresa una dirección web o enlace.';
        linkModalError.style.display = 'block';
      }
      return;
    }

    if (!currentEnvelopeId) return;
    const env = envelopes.find((e) => e.id === currentEnvelopeId);
    if (!env) return;

    // Formatear URL con https:// si no tiene protocolo
    const formattedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl;

    if (!env.links) env.links = [];
    env.links.push({
      url: formattedUrl,
      title: title || ''
    });
    env.updatedAt = Date.now();

    if (dbRef) {
      dbRef.child(currentEnvelopeId).set(env);
    }
    persistEnvelopes();

    closeLinkModal();
    renderLinksSection(env);
    updateSaveIndicator('Enlace adjuntado');
  }

  function removeLinkAtIndex(index) {
    if (!currentEnvelopeId) return;
    const env = envelopes.find((e) => e.id === currentEnvelopeId);
    if (!env || !env.links) return;

    env.links.splice(index, 1);
    env.updatedAt = Date.now();
    if (dbRef) {
      dbRef.child(currentEnvelopeId).set(env);
    }
    persistEnvelopes();
    renderLinksSection(env);
    updateSaveIndicator('Enlace eliminado');
  }

  // -------------------------------------------------------------------------
  // Sistema de Notificaciones Toast Flotantes
  // -------------------------------------------------------------------------
  function showToast(message, type = 'info', duration = 3500) {
    if (!toastContainer) return { close: () => {}, update: () => {} };

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;

    let iconHtml = '✨';
    if (type === 'success') iconHtml = '✅';
    else if (type === 'error') iconHtml = '⚠️';
    else if (type === 'loading') iconHtml = '<span class="spinner-icon"></span>';

    toast.innerHTML = `
      <span class="toast-icon">${iconHtml}</span>
      <span class="toast-text">${message}</span>
    `;

    toastContainer.appendChild(toast);

    let timer = null;
    const close = () => {
      if (timer) clearTimeout(timer);
      toast.classList.add('hiding');
      setTimeout(() => {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    };

    const update = (newMsg, newType) => {
      if (newType) {
        toast.className = `toast-message toast-${newType}`;
        let newIcon = '✨';
        if (newType === 'success') newIcon = '✅';
        else if (newType === 'error') newIcon = '⚠️';
        else if (newType === 'loading') newIcon = '<span class="spinner-icon"></span>';
        const iconEl = toast.querySelector('.toast-icon');
        if (iconEl) iconEl.innerHTML = newIcon;
      }
      const textEl = toast.querySelector('.toast-text');
      if (textEl) textEl.textContent = newMsg;
    };

    if (duration > 0) {
      timer = setTimeout(close, duration);
    }

    return { close, update };
  }

  // -------------------------------------------------------------------------
  // Descarga de Fotografía Individual Original
  // -------------------------------------------------------------------------
  function downloadPhoto(src, filename) {
    if (!src) return;
    try {
      const a = document.createElement('a');
      a.href = src;
      a.download = filename || `Foto_Jenni_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('📸 Fotografía descargada con éxito', 'success', 2500);
    } catch (e) {
      console.error('Error al descargar foto:', e);
      showToast('No se pudo descargar la foto', 'error', 3000);
    }
  }

  // -------------------------------------------------------------------------
  // Manejo de Imágenes (Polaroids, Redimensionado y Compresión)
  // -------------------------------------------------------------------------
  function renderImages(imagesList) {
    imagesContainer.innerHTML = '';
    
    if (!imagesList || imagesList.length === 0) {
      imagesContainer.style.display = 'none';
      return;
    }

    imagesContainer.style.display = 'flex';

    imagesList.forEach((imgData, index) => {
      const card = document.createElement('div');
      card.className = 'polaroid-card';

      // Rotación aleatoria ligera para dar aspecto de fotos desordenadas en la mesa
      const randomRot = (index % 2 === 0 ? 1 : -1) * (1.5 + (index % 3) * 1.2);
      card.style.transform = `rotate(${randomRot}deg)`;

      card.innerHTML = `
        <div class="polaroid-img-wrapper">
          <img src="${imgData}" alt="Imagen adjunta ${index + 1}">
        </div>
        <button class="btn-download-image" data-index="${index}" title="Descargar esta foto en tamaño original">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        </button>
        <button class="btn-remove-image" data-index="${index}" title="Eliminar imagen">✕</button>
      `;

      // Clic para ampliar imagen
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-image') || e.target.closest('.btn-download-image')) return;
        showImageViewer(imgData);
      });

      // Clic para descargar imagen individual
      const downloadBtn = card.querySelector('.btn-download-image');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          downloadPhoto(imgData, `Foto_Recuerdo_Jenni_${index + 1}_${Date.now()}.jpg`);
        });
      }

      // Clic para eliminar imagen
      const removeBtn = card.querySelector('.btn-remove-image');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImageAtIndex(index);
      });

      imagesContainer.appendChild(card);
    });
  }

  function removeImageAtIndex(index) {
    if (!currentEnvelopeId) return;
    const env = envelopes.find((e) => e.id === currentEnvelopeId);
    if (!env || !env.images) return;

    env.images.splice(index, 1);
    env.updatedAt = Date.now();
    if (dbRef) {
      dbRef.child(currentEnvelopeId).set(env);
    }
    persistEnvelopes();
    renderImages(env.images);
  }

  // Comprimir imagen usando un Canvas para evitar llenar el localStorage
  function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Calidad 0.82 JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        callback(compressedDataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function handleFilesAdded(files) {
    if (!currentEnvelopeId || !files || files.length === 0) return;

    const env = envelopes.find((e) => e.id === currentEnvelopeId);
    if (!env) return;

    if (!env.images) env.images = [];

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) return;

      compressImage(file, (dataUrl) => {
        env.images.push(dataUrl);
        env.updatedAt = Date.now();
        if (dbRef) {
          dbRef.child(currentEnvelopeId).set(env);
        }
        persistEnvelopes();
        renderImages(env.images);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Visor de Imagen Grande (Zoom)
  // -------------------------------------------------------------------------
  function showImageViewer(src) {
    currentViewerImageSrc = src;
    imageViewerImg.src = src;
    imageViewerModal.classList.add('active');
  }

  function hideImageViewer() {
    imageViewerModal.classList.remove('active');
    imageViewerImg.src = '';
    currentViewerImageSrc = '';
  }

  // -------------------------------------------------------------------------
  // Descarga de Carta Individual como Imagen (PNG)
  // -------------------------------------------------------------------------
  async function downloadCurrentLetterAsImage() {
    if (!currentEnvelopeId) return;
    const env = envelopes.find((e) => e.id === currentEnvelopeId);
    if (!env) return;

    saveCurrentDataImmediately();

    const toast = showToast('📸 Generando imagen de la carta...', 'loading', 0);

    try {
      if (typeof html2canvas === 'undefined') {
        throw new Error('Librería html2canvas no encontrada');
      }

      // Crear tarjeta temporal decorativa de exportación
      const exportCard = document.createElement('div');
      exportCard.style.position = 'fixed';
      exportCard.style.top = '-9999px';
      exportCard.style.left = '-9999px';
      exportCard.style.width = '640px';
      exportCard.style.backgroundColor = '#fffdf9';
      exportCard.style.backgroundImage = 'radial-gradient(#ebd8c3 0.75px, transparent 0.75px)';
      exportCard.style.backgroundSize = '20px 20px';
      exportCard.style.borderRadius = '16px';
      exportCard.style.padding = '2.2rem';
      exportCard.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
      exportCard.style.border = '1px solid #ebd8c3';
      exportCard.style.fontFamily = "'Outfit', sans-serif";
      exportCard.style.color = '#2d2a26';

      const themeName = COLOR_NAMES[env.theme || 'kraft'] || 'Sobre';
      const authorText = env.author ? (env.author.toLowerCase().startsWith('de:') ? env.author : `De: ${env.author}`) : 'De: Alguien especial';
      const dateText = formatDate(env.updatedAt || Date.now());

      let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #edd5be; padding-bottom: 0.8rem; margin-bottom: 1.2rem;">
          <div style="display: flex; align-items: center; gap: 0.6rem;">
            <span style="font-size: 0.85rem; font-weight: 700; color: #796652; background: #f1e4d3; padding: 0.3rem 0.7rem; border-radius: 6px;">${dateText}</span>
            <span style="font-size: 0.8rem; color: #947e68; font-style: italic;">Sobre ${themeName}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.4rem; font-weight: 600; color: #7a5020; font-size: 0.85rem;">
            <span>💌 Buzón de Jenni</span>
          </div>
        </div>

        <div style="margin-bottom: 1.2rem;">
          <div style="font-size: 1.15rem; font-weight: 700; color: #433324; margin-bottom: 0.3rem; display: flex; align-items: center; gap: 0.4rem;">
            <span>✍️</span> <span>${escapeHtml(authorText)}</span>
          </div>
          <div style="font-family: 'Caveat', cursive, sans-serif; font-size: 2.3rem; font-weight: 700; color: #2b231a; line-height: 1.2;">
            ${escapeHtml(env.title || 'Carta para Jenni')}
          </div>
        </div>
      `;

      // Fotos adjuntas
      if (env.images && env.images.length > 0) {
        html += `<div style="display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 1.5rem;">`;
        env.images.forEach((img) => {
          html += `
            <div style="background: #fff; padding: 6px 6px 14px 6px; border-radius: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.12); border: 1px solid #ebd8c3; max-width: 170px;">
              <img src="${img}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 2px; display: block;" />
            </div>
          `;
        });
        html += `</div>`;
      }

      // Enlaces adjuntos
      if (env.links && env.links.length > 0) {
        html += `<div style="margin-bottom: 1.2rem; padding: 0.7rem; background: rgba(245,236,224,0.6); border-radius: 8px; border: 1px solid #eedecf;">`;
        html += `<div style="font-size: 0.8rem; font-weight: 700; color: #6d553f; margin-bottom: 0.4rem;">🔗 Enlaces adjuntos:</div>`;
        env.links.forEach((lk) => {
          const info = getLinkInfo(lk.url, lk.title);
          html += `<div style="font-size: 0.82rem; color: #5a4533; margin-bottom: 0.2rem;">• <b>${escapeHtml(info.title)}</b>: <span style="color: #796652;">${escapeHtml(info.url)}</span></div>`;
        });
        html += `</div>`;
      }

      // Contenido de texto
      const textFormatted = escapeHtml(env.content || 'Sin contenido de texto.').replace(/\n/g, '<br>');
      html += `
        <div style="font-size: 1.55rem; line-height: 1.8; color: #2d2a26; min-height: 100px; font-family: 'Caveat', cursive, sans-serif; padding: 0.5rem 0; border-top: 1px dashed #e2cfbc;">
          ${textFormatted}
        </div>

        <div style="margin-top: 2rem; padding-top: 0.8rem; border-top: 1px solid #edd5be; display: flex; justify-content: space-between; font-size: 0.78rem; color: #9c8a77;">
          <span>🎂 Cartas para Jenni • Feliz Cumpleaños</span>
          <span>✦ Recuerdo Especial</span>
        </div>
      `;

      exportCard.innerHTML = html;
      document.body.appendChild(exportCard);

      // Esperar a que las imágenes carguen
      const imgs = exportCard.querySelectorAll('img');
      await Promise.all(Array.from(imgs).map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      const canvas = await html2canvas(exportCard, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fffdf9',
        logging: false
      });

      document.body.removeChild(exportCard);

      const cleanName = (env.author || env.title || 'Recuerdo')
        .replace(/[^a-z0-9áéíóúñ_-]/gi, '_')
        .slice(0, 30);
      const filename = `Carta_Jenni_${cleanName}_${Date.now()}.png`;

      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.close();
      showToast('📸 ¡Carta guardada como imagen (PNG)!', 'success', 3500);

      if (typeof confetti === 'function') {
        confetti({ particleCount: 50, spread: 65, origin: { y: 0.7 } });
      }
    } catch (err) {
      console.error('Error al generar imagen de la carta:', err);
      toast.close();
      showToast('No se pudo generar la imagen de la carta', 'error', 3500);
    }
  }

  // -------------------------------------------------------------------------
  // Descarga de Álbum Completo de Cartas en PDF
  // -------------------------------------------------------------------------
  async function downloadAllLettersAsPdf() {
    if (!envelopes || envelopes.length === 0) {
      showToast('El buzón aún no tiene cartas para generar un álbum.', 'info', 3500);
      return;
    }

    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
      showToast('Librería jsPDF no disponible en este momento.', 'error', 3500);
      return;
    }

    const toast = showToast('📖 Creando Álbum de Cartas para Jenni en PDF...', 'loading', 0);

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;

      // ==========================================
      // PÁGINA 1: PORTADA ELEGANTE DE CUMPLEAÑOS
      // ==========================================
      doc.setFillColor(255, 243, 247);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // Marcos decorativos
      doc.setDrawColor(235, 175, 195);
      doc.setLineWidth(1.2);
      doc.rect(12, 12, pageWidth - 24, pageHeight - 24);
      doc.setLineWidth(0.4);
      doc.setDrawColor(210, 140, 165);
      doc.rect(15, 15, pageWidth - 30, pageHeight - 30);

      // Icono / Sello superior
      doc.setFillColor(255, 255, 255);
      doc.circle(pageWidth / 2, 70, 24, 'FD');
      doc.setFontSize(28);
      doc.setTextColor(180, 50, 90);
      doc.text('🎂', pageWidth / 2, 73, { align: 'center' });

      // Título principal
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(75, 25, 45);
      doc.text('Cartas para Jenni', pageWidth / 2, 115, { align: 'center' });

      // Subtítulo
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(13);
      doc.setTextColor(140, 70, 95);
      doc.text('Álbum de Recuerdos & Dedicatorias de Cumpleaños', pageWidth / 2, 126, { align: 'center' });

      // Línea divisoria
      doc.setDrawColor(235, 175, 195);
      doc.setLineWidth(0.8);
      doc.line(pageWidth / 2 - 40, 136, pageWidth / 2 + 40, 136);

      // Cuadro de información
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(pageWidth / 2 - 60, 160, 120, 42, 4, 4, 'FD');
      doc.setFontSize(11);
      doc.setTextColor(80, 50, 60);
      doc.text(`Total de cartas: ${envelopes.length} sobre(s)`, pageWidth / 2, 174, { align: 'center' });
      doc.text(`Fecha del buzón: ${formatDate(Date.now())}`, pageWidth / 2, 183, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(150, 90, 110);
      doc.text('✨ Creado con amor por tus seres queridos ✨', pageWidth / 2, 192, { align: 'center' });

      // Frase emotiva
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(120, 80, 95);
      doc.text('«Cada carta guarda un recuerdo, un abrazo y un deseo para ti»', pageWidth / 2, 250, { align: 'center' });

      // ==========================================
      // PÁGINAS SIGUIENTES: CADA CARTA
      // ==========================================
      const THEME_PDF_BG = {
        kraft: [253, 248, 240],
        rose: [255, 245, 248],
        lavender: [248, 245, 255],
        mint: [244, 253, 248],
        sky: [244, 250, 255],
        terracotta: [255, 246, 242],
        noir: [245, 245, 248]
      };

      for (let i = 0; i < envelopes.length; i++) {
        const env = envelopes[i];
        doc.addPage();

        const bg = THEME_PDF_BG[env.theme || 'kraft'] || [253, 248, 240];
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Borde
        doc.setDrawColor(215, 195, 175);
        doc.setLineWidth(0.6);
        doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - (margin * 2) + 8);

        let currentY = margin + 6;

        // Banda superior
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(margin, currentY, contentWidth, 18, 3, 3, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(130, 95, 65);
        const authorStr = env.author ? (env.author.toLowerCase().startsWith('de:') ? env.author : `De: ${env.author}`) : 'De: Alguien especial';
        doc.text(authorStr, margin + 6, currentY + 11);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(150, 130, 115);
        doc.text(formatDate(env.updatedAt || Date.now()), margin + contentWidth - 6, currentY + 11, { align: 'right' });

        currentY += 28;

        // Título de la carta
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(50, 35, 25);
        const titleLines = doc.splitTextToSize(env.title || 'Carta para Jenni', contentWidth);
        doc.text(titleLines, margin, currentY);
        currentY += (titleLines.length * 7) + 4;

        // Línea divisoria
        doc.setDrawColor(225, 205, 185);
        doc.setLineWidth(0.5);
        doc.line(margin, currentY, margin + contentWidth, currentY);
        currentY += 8;

        // Texto de la carta
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(45, 38, 32);

        const bodyText = env.content ? env.content.trim() : '(Sin texto en esta carta)';
        const bodyLines = doc.splitTextToSize(bodyText, contentWidth);

        const maxTextHeight = (env.images && env.images.length > 0) ? 90 : 180;
        let textY = currentY;
        
        for (let lineIdx = 0; lineIdx < bodyLines.length; lineIdx++) {
          if (textY - currentY > maxTextHeight) {
            doc.text('...', margin, textY);
            break;
          }
          doc.text(bodyLines[lineIdx], margin, textY);
          textY += 6;
        }

        currentY = textY + 6;

        // Enlaces adjuntos
        if (env.links && env.links.length > 0 && currentY < 210) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(120, 85, 55);
          doc.text('Enlaces adjuntos:', margin, currentY);
          currentY += 5;

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(90, 70, 55);
          env.links.slice(0, 3).forEach((lk) => {
            const lkText = `• ${lk.title ? lk.title + ': ' : ''}${lk.url}`;
            const lkLines = doc.splitTextToSize(lkText, contentWidth);
            doc.text(lkLines, margin + 3, currentY);
            currentY += (lkLines.length * 4.5);
          });
          currentY += 4;
        }

        // Fotos insertadas
        if (env.images && env.images.length > 0) {
          const maxImgs = Math.min(env.images.length, 3);
          const availableHeight = pageHeight - margin - currentY - 12;

          if (availableHeight > 35) {
            const imgBoxWidth = Math.min(48, (contentWidth - ((maxImgs - 1) * 8)) / maxImgs);
            const imgBoxHeight = Math.min(availableHeight - 6, 42);

            let imgX = margin;
            for (let imgIdx = 0; imgIdx < maxImgs; imgIdx++) {
              try {
                doc.setFillColor(255, 255, 255);
                doc.setDrawColor(220, 205, 190);
                doc.roundedRect(imgX, currentY, imgBoxWidth, imgBoxHeight + 8, 2, 2, 'FD');

                doc.addImage(
                  env.images[imgIdx],
                  'JPEG',
                  imgX + 2,
                  currentY + 2,
                  imgBoxWidth - 4,
                  imgBoxHeight - 2
                );
              } catch (imgErr) {
                console.warn('No se pudo incrustar imagen en PDF:', imgErr);
              }
              imgX += imgBoxWidth + 8;
            }
          }
        }

        // Pie de página
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(160, 140, 125);
        doc.text(
          `Carta ${i + 1} de ${envelopes.length} • Buzón de Cumpleaños de Jenni`,
          pageWidth / 2,
          pageHeight - margin + 2,
          { align: 'center' }
        );
      }

      doc.save(`Album_Cartas_Cumpleanos_Jenni_${Date.now()}.pdf`);

      toast.close();
      showToast('📖 ¡Álbum de cartas generado y descargado en PDF!', 'success', 4000);

      if (typeof confetti === 'function') {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.5 } });
      }
    } catch (err) {
      console.error('Error al generar el PDF del álbum:', err);
      toast.close();
      showToast('Hubo un problema al crear el PDF del álbum', 'error', 3500);
    }
  }

  // -------------------------------------------------------------------------
  // Configuración de Eventos de la Interfaz
  // -------------------------------------------------------------------------
  function setupEventListeners() {
    // Botón nuevo sobre
    btnNewEnvelope.addEventListener('click', createNewEnvelope);

    // Botones de cierre
    btnCloseNote.addEventListener('click', closeEnvelope);
    btnDoneNote.addEventListener('click', closeEnvelope);
    modalBackdrop.addEventListener('click', closeEnvelope);

    // Botón eliminar sobre
    btnDeleteNote.addEventListener('click', deleteCurrentEnvelope);

    // Inputs de texto con auto-guardado y detección de enlaces
    if (noteAuthorInput) noteAuthorInput.addEventListener('input', queueAutoSave);
    noteTitleInput.addEventListener('input', queueAutoSave);
    noteTextInput.addEventListener('input', () => {
      renderLinksSection();
      queueAutoSave();
    });

    // Alternar entre modo lectura (enlaces interactivos en el texto) y modo edición
    if (btnToggleView) {
      btnToggleView.addEventListener('click', () => {
        setReadingMode(!isReadingMode);
      });
    }

    // Modal para añadir enlace
    if (btnAddLink) {
      btnAddLink.addEventListener('click', openLinkModal);
    }
    if (btnCloseLinkModal) {
      btnCloseLinkModal.addEventListener('click', closeLinkModal);
    }
    if (btnCancelLink) {
      btnCancelLink.addEventListener('click', closeLinkModal);
    }
    if (linkModalBackdrop) {
      linkModalBackdrop.addEventListener('click', closeLinkModal);
    }
    if (btnConfirmLink) {
      btnConfirmLink.addEventListener('click', handleConfirmLink);
    }
    [linkUrlInput, linkTitleInput].forEach((inp) => {
      if (inp) {
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleConfirmLink();
          }
        });
      }
    });

    // Subida de imagen por input file
    imageFileInput.addEventListener('change', (e) => {
      handleFilesAdded(e.target.files);
      imageFileInput.value = ''; // resetear
    });

    // Soporte para pegar imágenes con Ctrl + V
    window.addEventListener('paste', (e) => {
      if (!currentEnvelopeId) return;

      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      const imageFiles = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) imageFiles.push(blob);
        }
      }

      if (imageFiles.length > 0) {
        handleFilesAdded(imageFiles);
      }
    });

    // Soporte para Drag and Drop de imágenes
    ['dragenter', 'dragover'].forEach((eventName) => {
      notepadSheet.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropHintBar.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      notepadSheet.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropHintBar.classList.remove('drag-over');
      });
    });

    notepadSheet.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        handleFilesAdded(dt.files);
      }
    });

    // Selector de color del sobre
    colorDropdownBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      colorPalettePopover.classList.toggle('show');
    });

    document.querySelectorAll('.palette-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedColor = btn.getAttribute('data-color');
        if (!currentEnvelopeId) return;

        const env = envelopes.find((e) => e.id === currentEnvelopeId);
        if (!env) return;

        env.theme = selectedColor;
        env.updatedAt = Date.now();
        applyModalTheme(selectedColor);
        if (dbRef) {
          dbRef.child(currentEnvelopeId).set(env);
        }
        persistEnvelopes();
        colorPalettePopover.classList.remove('show');
      });
    });

    // Cerrar el popover si se hace clic fuera
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.color-picker-wrapper')) {
        colorPalettePopover.classList.remove('show');
      }
    });

    // Descarga de álbum completo en PDF
    if (btnDownloadAlbum) {
      btnDownloadAlbum.addEventListener('click', downloadAllLettersAsPdf);
    }

    // Descarga de carta actual como imagen PNG
    if (btnDownloadNote) {
      btnDownloadNote.addEventListener('click', downloadCurrentLetterAsImage);
    }

    // Visor de imagen grande y botón de descarga de fotografía
    btnCloseImageViewer.addEventListener('click', hideImageViewer);
    imageViewerModal.addEventListener('click', (e) => {
      if (e.target === imageViewerModal) hideImageViewer();
    });

    if (btnDownloadViewerImage) {
      btnDownloadViewerImage.addEventListener('click', () => {
        if (currentViewerImageSrc) {
          downloadPhoto(currentViewerImageSrc, `Foto_Recuerdo_Jenni_${Date.now()}.jpg`);
        }
      });
    }

    // Modal de guía para compartir en cumpleaños
    if (btnShareGuide && shareModal) {
      btnShareGuide.addEventListener('click', () => {
        shareModal.setAttribute('aria-hidden', 'false');
        shareModal.classList.add('active');
      });

      const closeShareModal = () => {
        shareModal.classList.remove('active');
        shareModal.setAttribute('aria-hidden', 'true');
        if (saveWebFeedback) saveWebFeedback.textContent = '';
      };

      if (btnCloseShare) btnCloseShare.addEventListener('click', closeShareModal);
      if (shareModalBackdrop) shareModalBackdrop.addEventListener('click', closeShareModal);

      if (btnSaveWebLetters) {
        btnSaveWebLetters.addEventListener('click', async () => {
          saveCurrentDataImmediately();
          saveWebFeedback.textContent = 'Guardando...';

          try {
            // Intentar guardar en server.js local
            const res = await fetch('/api/save-defaults', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(envelopes, null, 2)
            });

            if (res.ok) {
              saveWebFeedback.textContent = '✅ ¡Guardado en cartas_cumpleanos.json!';
            } else {
              saveWebFeedback.textContent = '⚠️ Descargando archivo json...';
              downloadLettersJson();
            }
          } catch (e) {
            // Si no está corriendo el endpoint, descargar archivo json
            saveWebFeedback.textContent = '✅ Descargando archivo json para tu carpeta...';
            downloadLettersJson();
          }

          if (typeof confetti === 'function') {
            confetti({ particleCount: 80, spread: 80, origin: { y: 0.5 } });
          }
        });
      }
    }

    function downloadLettersJson() {
      const blob = new Blob([JSON.stringify(envelopes, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cartas_cumpleanos.json';
      a.click();
    }

    // Tecla Escape para cerrar modales
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (linkModal && linkModal.style.display === 'flex') {
          closeLinkModal();
        } else if (imageViewerModal.classList.contains('active')) {
          hideImageViewer();
        } else if (shareModal && shareModal.classList.contains('active')) {
          shareModal.classList.remove('active');
        } else if (noteModal.classList.contains('active')) {
          closeEnvelope();
        }
      }
    });
  }

  // Iniciar aplicación al cargar el DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
