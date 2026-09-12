/**
 * Buzón Mágico - Lógica de Sobres 3D y Bloc de Notas
 */

(function () {
  'use strict';

  // Constantes y claves de almacenamiento
  const STORAGE_KEY = 'magic_envelopes_notes_v1';
  
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
      dbRef = firebase.database().ref('cartas_jenni');
    }
  } catch (err) {
    console.warn('Firebase no inicializado aún:', err);
  }

  // Datos iniciales de cumpleaños para Jenni
  const INITIAL_ENVELOPES = [
    {
      id: 'carta-jenni-1',
      author: 'De: Con Todo Nuestro Amor',
      title: '🎂 ¡Feliz Cumpleaños Jenni! ✨',
      content: '¡Hoy celebramos tu vida, Jenni! 💖\n\nCreamos este buzón interactivo para que todas las personas que te queremos podamos dejarte cartas, fotos y recuerdos especiales desde cualquier lugar.\n\n¡Abre los demás sobres para ver quién más te escribió o añade una nueva carta!',
      images: [],
      theme: 'rose',
      updatedAt: Date.now()
    },
    {
      id: 'carta-jenni-2',
      author: 'De: Tus Amigos',
      title: '📸 Nuestros Mejores Momentos',
      content: '¡Gracias por tantas risas, salidas y momentos compartidos, Jenni!\n\nQue este nuevo año venga cargado de sueños cumplidos, viajes, felicidad y mucha salud.\n\n¡Te queremos muchísimo!',
      images: [],
      theme: 'mint',
      updatedAt: Date.now() - 3600000
    }
  ];

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

  // Selector de color
  const colorDropdownBtn = document.getElementById('color-dropdown-btn');
  const colorPalettePopover = document.getElementById('color-palette-popover');
  const currentColorDot = document.getElementById('current-color-dot');

  // Visor de imágenes ampliadas
  const imageViewerModal = document.getElementById('image-viewer-modal');
  const imageViewerImg = document.getElementById('image-viewer-img');
  const btnCloseImageViewer = document.getElementById('btn-close-image-viewer');

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
          // Si la base de datos está vacía, inicializar con las cartas de bienvenida
          INITIAL_ENVELOPES.forEach((env) => {
            dbRef.child(env.id).set(env);
          });
          envelopes = INITIAL_ENVELOPES;
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
  function renderGrid() {
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

      // Contador de imágenes
      const count = (env.images && env.images.length) || 0;
      if (count > 0) {
        imgNumEl.textContent = count;
      } else {
        const previewEl = clone.querySelector('.card-preview-count');
        if (previewEl) previewEl.style.display = 'none';
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

    if (dbRef) {
      dbRef.child(currentEnvelopeId).remove();
    }
    envelopes = envelopes.filter((e) => e.id !== currentEnvelopeId);
    persistEnvelopes();

    noteModal.classList.remove('active');
    noteModal.setAttribute('aria-hidden', 'true');

    setTimeout(() => {
      currentEnvelopeId = null;
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
        <button class="btn-remove-image" data-index="${index}" title="Eliminar imagen">✕</button>
      `;

      // Clic para ampliar imagen
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-remove-image')) return;
        showImageViewer(imgData);
      });

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
    imageViewerImg.src = src;
    imageViewerModal.classList.add('active');
  }

  function hideImageViewer() {
    imageViewerModal.classList.remove('active');
    imageViewerImg.src = '';
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

    // Inputs de texto con auto-guardado
    if (noteAuthorInput) noteAuthorInput.addEventListener('input', queueAutoSave);
    noteTitleInput.addEventListener('input', queueAutoSave);
    noteTextInput.addEventListener('input', queueAutoSave);

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

    // Visor de imagen grande
    btnCloseImageViewer.addEventListener('click', hideImageViewer);
    imageViewerModal.addEventListener('click', (e) => {
      if (e.target === imageViewerModal) hideImageViewer();
    });

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
        if (imageViewerModal.classList.contains('active')) {
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
