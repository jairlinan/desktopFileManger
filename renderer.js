const panels = {
    left: {
        container: document.getElementById('panel-left'),
        pathDisplay: document.getElementById('path-left'),
        fileList: document.getElementById('file-list-left'),
        upButton: document.getElementById('up-btn-left'),
        currentPath: '',
        isSearchResults: false,
        lastSelectedItem: null
    },
    right: {
        container: document.getElementById('panel-right'),
        pathDisplay: document.getElementById('path-right'),
        fileList: document.getElementById('file-list-right'),
        upButton: document.getElementById('up-btn-right'),
        currentPath: '',
        isSearchResults: false,
        lastSelectedItem: null
    },
};

let contextMenu;
let contextTarget = null;
let showHiddenFiles = false;
let activePanelId = 'left';
let dragSourceInfo = null;

const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
const pdfExtension = '.pdf';
const textExtensions = ['.txt', '.md', '.js', '.json', '.css', '.html', '.log'];

// --- Helper Functions ---
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// --- UI Logic ---

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.5s forwards';
        toast.addEventListener('animationend', () => toast.remove());
    }, 5000);
}



// --- Progress Indicator Logic ---

function showProgressIndicator(action) {
    const indicator = document.getElementById('move-progress-indicator');
    const cancelBtn = document.getElementById('cancel-operation-btn');

    // The title is now set in handleFileOperation.
    // We just need to set the initial state of the 'currentFile' field.
    updateProgressUI({ currentFile: 'Calculando...', etr: -1 });
    cancelBtn.style.display = 'inline-block';
    indicator.classList.add('active');
}

function hideProgressIndicator() {
    document.getElementById('move-progress-indicator').classList.remove('active');
    document.getElementById('cancel-operation-btn').style.display = 'none';

    // Limpiar campos de origen y destino
    document.querySelector('#progress-current-file span').textContent = '-';
    document.querySelector('#progress-source span').textContent = '-';
    document.querySelector('#progress-destination span').textContent = '-';
}

function updateProgressUI({ currentFile, processedBytes = 0, totalSize = 0, etr = -1 }) {
    const titleEl = document.getElementById('move-progress-title');
    const currentFileEl = document.querySelector('#progress-current-file span');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const etrSpan = document.querySelector('#progress-etr span');

    if (currentFile) {
        currentFileEl.textContent = currentFile;
    }

    const percent = totalSize > 0 ? Math.round((processedBytes / totalSize) * 100) : 0;
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;

    if (processedBytes > 0 && totalSize > 0) {
        const baseTitle = titleEl.textContent.split(' (')[0];
        titleEl.textContent = `${baseTitle} (${formatBytes(processedBytes)} / ${formatBytes(totalSize)})`;
    }

    if (etr === -1) {
        etrSpan.textContent = 'Calculando...';
    } else {
        const minutes = Math.floor(etr / 60);
        const seconds = Math.floor(etr % 60);
        etrSpan.textContent = `${minutes}m ${seconds}s`;
    }
}

// --- Event Listeners and Initialization ---

document.addEventListener('DOMContentLoaded', async () => {

    // --- Directory and File Rendering ---

    async function loadDirectory(panelId, directoryPath) {
        const panel = panels[panelId];
        try {
            if (panel.isSearchResults) {
                panel.isSearchResults = false;
                panel.upButton.querySelector('i').className = 'fas fa-arrow-up';
                panel.upButton.title = 'Subir un nivel';
            }
    
            panel.currentPath = directoryPath;
            panel.pathDisplay.textContent = directoryPath;
            panel.pathDisplay.title = directoryPath;
            panel.fileList.innerHTML = '';
    
            let filesToDisplay = [];
            const platform = await window.electronAPI.getPlatform();
    
            if (directoryPath === 'computer:///') {
                panel.upButton.style.display = 'none';
                const { success, drives, error } = await window.electronAPI.getLogicalDrives();
                if (success) filesToDisplay.push(...drives);
                else console.error('Error al obtener unidades lógicas:', error);
            } else {
                panel.upButton.style.display = 'block';
                const parentDir = await window.electronAPI.pathDirname(directoryPath);
                const isWindowsDriveRoot = platform === 'win32' && directoryPath && directoryPath.match(/^[A-Z]:\?$/i);
    
                if (parentDir !== directoryPath) {
                    filesToDisplay.push({ name: '..', isDirectory: true });
                } else if (isWindowsDriveRoot) {
                    filesToDisplay.push({ name: '..', isDirectory: true, specialPath: 'computer:///' });
                }
    
                const sortBy = document.getElementById('sort-by').value;
                const sortOrder = document.getElementById('sort-order').value;
                const { files, error: dirReadError } = await window.electronAPI.getDirectoryContent(directoryPath, sortBy, sortOrder);
                if (dirReadError) throw new Error(dirReadError);
    
                const filesToPush = showHiddenFiles ? files : files.filter(file => !file.isHidden);
                filesToDisplay.push(...filesToPush);
            }
    
            for (const file of filesToDisplay) {
                panel.fileList.appendChild(await createListItem(file, panelId));
            }
    
        } catch (e) {
            panel.fileList.innerHTML = `<li class="error-message">Error: ${e.message}</li>`;
            console.error('Error en loadDirectory:', e);
        }
    }
    
    function getIconForFile(fileName) {
        const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
        switch (extension) {
            case '.pdf': return { icon: 'fa-file-pdf', colorClass: 'icon-pdf' };
            case '.doc': case '.docx': return { icon: 'fa-file-word', colorClass: 'icon-word' };
            case '.xls': case '.xlsx': return { icon: 'fa-file-excel', colorClass: 'icon-excel' };
            case '.zip': case '.rar': case '.7z': return { icon: 'fa-file-archive', colorClass: 'icon-archive' };
            case '.jpg': case '.jpeg': case '.png': case '.gif': return { icon: 'fa-file-image', colorClass: 'icon-image' };
            default: return { icon: 'fa-file-alt', colorClass: 'icon-default' };
        }
    }
    
    async function createListItem(file, panelId, isSearchResult = false) {
        const listItem = document.createElement('li');
        listItem.dataset.fileName = file.name;
        listItem.draggable = true;

        // Guardar metadatos para el ordenamiento
        listItem.dataset.isDirectory = file.isDirectory;
        listItem.dataset.size = file.size || 0;
        listItem.dataset.mtime = file.mtime || 0;

        if (file.isDrive) listItem.dataset.isDrive = 'true';
        if (file.specialPath) listItem.dataset.specialPath = file.specialPath;
    
        const iconClass = file.isDrive ? 'fa-hdd icon-drive' : (file.isDirectory ? 'fa-folder icon-folder' : `${getIconForFile(file.name).icon} ${getIconForFile(file.name).colorClass}`);
        const displayName = file.isDrive && file.label ? `${file.name} (${file.label})` : file.name;
        listItem.innerHTML = `<i class="file-icon fas ${iconClass}"></i><div class="file-main-info"><span class="file-name">${displayName}</span></div>`;
    
        if (isSearchResult) {
            listItem.querySelector('.file-main-info').innerHTML += `<span class="file-path">${file.path}</span>`;
        }
    
        listItem.addEventListener('dblclick', async () => {
            if (file.isDirectory || file.isDrive || file.specialPath) {
                const newPath = file.isDrive ? `${file.name}\\` : (file.specialPath || await window.electronAPI.pathJoin(panels[panelId].currentPath, file.name));
                loadDirectory(panelId, newPath);
            } else {
                const fullPath = isSearchResult ? file.path : await window.electronAPI.pathJoin(panels[panelId].currentPath, file.name);
                const { success, error } = await window.electronAPI.openFile(fullPath);
                if (!success) showToast(`No se pudo abrir el archivo: ${error}`, 'error');
            }
        });
    
        listItem.addEventListener('click', (e) => {
            const panel = panels[panelId];
            const allItems = Array.from(panel.fileList.children);
    
            if (e.shiftKey && panel.lastSelectedItem) {
                e.preventDefault();
                const lastIndex = allItems.indexOf(panel.lastSelectedItem);
                const currentIndex = allItems.indexOf(listItem);
                const [start, end] = [lastIndex, currentIndex].sort((a, b) => a - b);
                
                if (!e.ctrlKey) {
                    allItems.forEach(item => item.classList.remove('selected'));
                }
                for (let i = start; i <= end; i++) {
                    allItems[i].classList.add('selected');
                }
            } else if (e.ctrlKey) {
                listItem.classList.toggle('selected');
                panel.lastSelectedItem = listItem;
            } else {
                allItems.forEach(item => item.classList.remove('selected'));
                listItem.classList.add('selected');
                panel.lastSelectedItem = listItem;
            }
            updatePreviewForSelection(panelId, isSearchResult);
        });
    
        return listItem;
    }

    function sortSearchResults(panelId) {
        const panel = panels[panelId];
        if (!panel || !panel.isSearchResults) return;

        const sortBy = document.getElementById('sort-by').value;
        const sortOrder = document.getElementById('sort-order').value;

        const items = Array.from(panel.fileList.children);
        const resultItems = items.filter(item => item.dataset.fileName);

        resultItems.sort((a, b) => {
            const aIsDir = a.dataset.isDirectory === 'true';
            const bIsDir = b.dataset.isDirectory === 'true';

            if (aIsDir && !bIsDir) return -1;
            if (!aIsDir && bIsDir) return 1;

            let comparison = 0;
            switch (sortBy) {
                case 'name':
                    comparison = a.dataset.fileName.localeCompare(b.dataset.fileName, undefined, { sensitivity: 'base' });
                    break;
                case 'type':
                    const extA = aIsDir ? '' : a.dataset.fileName.slice(a.dataset.fileName.lastIndexOf('.')).toLowerCase();
                    const extB = bIsDir ? '' : b.dataset.fileName.slice(b.dataset.fileName.lastIndexOf('.')).toLowerCase();
                    comparison = extA.localeCompare(extB, undefined, { sensitivity: 'base' });
                    if (comparison === 0) {
                        comparison = a.dataset.fileName.localeCompare(b.dataset.fileName, undefined, { sensitivity: 'base' });
                    }
                    break;
                case 'size':
                    comparison = parseInt(a.dataset.size, 10) - parseInt(b.dataset.size, 10);
                    break;
                case 'date':
                    comparison = parseInt(a.dataset.mtime, 10) - parseInt(b.dataset.mtime, 10);
                    break;
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        resultItems.forEach(item => panel.fileList.appendChild(item));
    }

    async function updatePreviewForSelection(panelId, isSearchResult = false) {
        const panel = panels[panelId];
        const selectedItems = panel.fileList.querySelectorAll('.selected');

        if (selectedItems.length !== 1) {
            clearPreview();
            return;
        }

        const selectedItem = selectedItems[0];
        const fileName = selectedItem.dataset.fileName;
        const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();

        if (imageExtensions.includes(ext) || ext === pdfExtension || textExtensions.includes(ext)) {
            const fullPath = isSearchResult 
                ? selectedItem.querySelector('.file-path').textContent 
                : await window.electronAPI.pathJoin(panel.currentPath, fileName);
            showPreview(fullPath);
        } else {
            clearPreview();
        }
    }

    contextMenu = document.getElementById('context-menu');
    const errorReportModal = document.getElementById('error-report-modal');
    const errorReportList = document.getElementById('error-report-list');
    const errorReportOkBtn = document.getElementById('error-report-ok-btn');
    const errorReportCloseBtn = document.getElementById('error-report-close-btn');

    const hideErrorModal = () => errorReportModal.classList.remove('active');
    errorReportOkBtn.addEventListener('click', hideErrorModal);
    errorReportCloseBtn.addEventListener('click', hideErrorModal);

    const sortBySelect = document.getElementById('sort-by');
    const sortOrderSelect = document.getElementById('sort-order');
    const cancelOperationBtn = document.getElementById('cancel-operation-btn');

    // --- Preview Panel Elements Initialization ---
    const previewPanel = document.getElementById('preview-panel');
    const previewHeader = document.getElementById('preview-header');
    const previewFilename = document.getElementById('preview-filename');
    const previewContent = document.getElementById('preview-content');
    const defaultMessage = document.getElementById('preview-default-message');
    const imagePreview = document.getElementById('image-preview');
    const pdfPreviewContainer = document.getElementById('pdf-preview-container');
    const textPreview = document.getElementById('text-preview');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const pdfControls = document.getElementById('pdf-controls');
    const pdfPrevPage = document.getElementById('pdf-prev-page');
    const pdfNextPage = document.getElementById('pdf-next-page');
    const pdfCurrentPage = document.getElementById('pdf-current-page');
    const pdfTotalPages = document.getElementById('pdf-total-pages');

    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;

    window.electronAPI.onOperationProgress(updateProgressUI);
    window.electronAPI.onOperationComplete(async ({ success, errors, action, cancelled }) => {
        if (success && !cancelled) {
            updateProgressUI({ title: 'Completado', processedBytes: 1, totalSize: 1 });
        }
        setTimeout(async () => {
            hideProgressIndicator();
            if (cancelled) {
                showToast('Operación cancelada por el usuario.', 'warning');
            } else if (errors && errors.length > 0) {
                // New error handling logic
                if (errors.length > 3) {
                    showToast(`La operación de ${action} falló para ${errors.length} archivos.`, 'error');
                    
                    // Populate and show modal
                    errorReportList.innerHTML = ''; // Clear previous errors
                    for (const err of errors) {
                        const li = document.createElement('li');
                        let friendlyError = err.error;

                        if (err.error.includes('EPERM') || err.error.includes('EACCES')) {
                            friendlyError = 'Permiso denegado o archivo en uso.';
                        } else if (err.error.includes('ENOENT')) {
                            friendlyError = 'El archivo o la carpeta no existe.';
                        } else if (err.error.includes('Invalid package')) {
                            friendlyError = 'Ruta inválida o error de cálculo.';
                        }
                        li.innerHTML = `<strong>${friendlyError}</strong><br>${err.file || 'Ruta no disponible'}`;
                        errorReportList.appendChild(li);
                    }
                    errorReportModal.classList.add('active');

                } else {
                    // Show individual toasts for few errors
                    for (const err of errors) {
                        const fileName = err.file ? await window.electronAPI.pathBasename(err.file) : 'Desconocido';
                        let errorMessage = `Error al ${action} '${fileName}': ${err.error}`;
                        if (err.error.includes('EPERM') || err.error.includes('EACCES')) {
                            errorMessage = `Permiso denegado o archivo en uso al ${action} '${fileName}'.`;
                        } else if (err.error.includes('ENOENT')) {
                            errorMessage = `El archivo o carpeta '${fileName}' no existe.`;
                        }
                        showToast(errorMessage, 'error');
                    }
                }
            } else if (success) {
                showToast(`Operación de ${action} completada con éxito.`, 'success');
            }
            loadDirectory('left', panels.left.currentPath);
            loadDirectory('right', panels.right.currentPath);
        }, success ? 400 : 0);
    });

    cancelOperationBtn.addEventListener('click', () => window.electronAPI.cancelOperation());
    
    const handleSortChange = () => {
        const panel = panels[activePanelId];
        if (panel.isSearchResults) {
            sortSearchResults(activePanelId);
        } else if (panel.currentPath) {
            loadDirectory(activePanelId, panel.currentPath);
        }
    };
    sortBySelect.addEventListener('change', handleSortChange);
    sortOrderSelect.addEventListener('change', handleSortChange);

    for (const panelId in panels) {
        const panel = panels[panelId];

        // Al hacer clic en cualquier parte del panel, se establece como activo
        panel.container.addEventListener('click', () => {
            if (activePanelId !== panelId) {
                if (panels[activePanelId]) {
                    panels[activePanelId].container.classList.remove('panel-active');
                }
                activePanelId = panelId;
                panel.container.classList.add('panel-active');
            }
        });

        panel.container.addEventListener('contextmenu', e => {
            const listItem = e.target.closest('li');
            showContextMenu(e, panelId, listItem);
        });

        panel.upButton.addEventListener('click', async () => {
            if (panel.isSearchResults) {
                document.getElementById('search-input').value = '';
                clearPreview();
                loadDirectory(panelId, panel.currentPath);
                return;
            }
            const currentPath = panel.currentPath;
            const platform = await window.electronAPI.getPlatform();
            const isWindowsDriveRoot = platform === 'win32' && currentPath && currentPath.match(/^[A-Z]:\\?$/i);
            if (isWindowsDriveRoot) {
                loadDirectory(panelId, 'computer:///');
            } else {
                const parentDir = await window.electronAPI.pathDirname(currentPath);
                if (parentDir !== currentPath) {
                    loadDirectory(panelId, parentDir);
                }
            }
        });
    }

    document.getElementById('move-to-right').addEventListener('click', () => handleFileOperation('mover', 'left', 'right'));
    document.getElementById('move-to-left').addEventListener('click', () => handleFileOperation('mover', 'right', 'left'));
    document.getElementById('copy-to-right').addEventListener('click', () => handleFileOperation('copiar', 'left', 'right'));
    document.getElementById('copy-to-left').addEventListener('click', () => handleFileOperation('copiar', 'right', 'left'));

    window.addEventListener('click', e => {
        if (contextMenu && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });

    // --- Context Menu Actions ---
    document.getElementById('ctx-rename').addEventListener('click', () => { 
        if (!contextTarget || !contextTarget.item) return;
        const { panelId, item } = contextTarget;
        hideContextMenu();
        const mainInfo = item.querySelector('.file-main-info');
        const fileNameSpan = mainInfo.querySelector('.file-name');
        if (!mainInfo || !fileNameSpan) return;
        const oldName = item.dataset.fileName;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = oldName;
        input.className = 'rename-input';
        const finishRename = async () => {
            const newName = input.value.trim();
            if (newName && newName !== oldName) {
                const oldPath = await window.electronAPI.pathJoin(panels[panelId].currentPath, oldName);
                const newPath = await window.electronAPI.pathJoin(panels[panelId].currentPath, newName);
                const { success, error } = await window.electronAPI.renameFile(oldPath, newPath);
                if (!success) showToast(`Error al renombrar: ${error}`, 'error');
                loadDirectory(panelId, panels[panelId].currentPath);
            } else {
                mainInfo.replaceChild(fileNameSpan, input);
            }
        };
        input.addEventListener('blur', finishRename);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.removeEventListener('blur', finishRename);
                mainInfo.replaceChild(fileNameSpan, input);
            }
        });
        mainInfo.replaceChild(input, fileNameSpan);
        input.focus();
        input.select();
    });

    // --- Preview Logic (scoped within DOMContentLoaded) ---
    let pdfDoc = null;
    let pageNum = 1;
    let pageIsRendering = false;
    
    function clearPreview() {
        if (!previewPanel) return;

        // Eliminar el contenedor de estado de búsqueda si existe
        const searchStatusEl = document.querySelector('.search-status-container');
        if (searchStatusEl) {
            searchStatusEl.remove();
        }

        defaultMessage.classList.remove('hidden');
        imagePreview.classList.add('hidden');
        pdfPreviewContainer.classList.add('hidden');
        textPreview.classList.add('hidden');
        previewFilename.textContent = '';
        imagePreview.src = '';
        if (pdfDoc) {
            pdfDoc.destroy();
            pdfDoc = null;
        }
    }

    async function showPreview(filePath) {
        if (!previewPanel) {
            return;
        }
        clearPreview();
        defaultMessage.classList.add('hidden');
        const filename = await window.electronAPI.pathBasename(filePath);
        previewFilename.textContent = filename;

        const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();

        if (imageExtensions.includes(ext)) {
            const { success, dataUrl, error } = await window.electronAPI.getFileAsDataUrl(filePath);
            if (success) {
                imagePreview.src = dataUrl;
                imagePreview.classList.remove('hidden');
            } else {
                showToast(`Error al cargar imagen: ${error}`, 'error');
                clearPreview();
            }
        } else if (ext === pdfExtension) {
            const { success, buffer, error } = await window.electronAPI.getFileAsBuffer(filePath);
            if (success) {
                pdfPreviewContainer.classList.remove('hidden');
                renderPdf(buffer);
            } else {
                showToast(`Error al cargar PDF: ${error}`, 'error');
                clearPreview();
            }
        } else if (textExtensions.includes(ext)) {
            const { success, buffer, error } = await window.electronAPI.getFileAsBuffer(filePath);
            if (success) {
                const textContent = new TextDecoder('utf-8').decode(buffer);
                textPreview.textContent = textContent;
                textPreview.classList.remove('hidden');
            } else {
                showToast(`Error al cargar archivo de texto: ${error}`, 'error');
                clearPreview();
            }
        } else {
            clearPreview();
        }
    }

    async function renderPdf(pdfData) {
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        try {
            pdfDoc = await loadingTask.promise;
            pdfTotalPages.textContent = pdfDoc.numPages;
            pageNum = 1;
            renderPage(pageNum);
        } catch (error) {
            showToast(`Error al procesar PDF: ${error.message}`, 'error');
            clearPreview();
        }
    }

    async function renderPage(num) {
        if (!pdfDoc || pageIsRendering) return;
        pageIsRendering = true;

        pdfCurrentPage.textContent = num;
        pdfPrevPage.disabled = num <= 1;
        pdfNextPage.disabled = num >= pdfDoc.numPages;

        try {
            const page = await pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: 1.5 });
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            const renderContext = {
                canvasContext: pdfCanvas.getContext('2d'),
                viewport: viewport
            };
            await page.render(renderContext).promise;
        } catch (error) {
            showToast(`Error al renderizar página ${num}: ${error.message}`, 'error');
        } finally {
            pageIsRendering = false;
        }
    }

    pdfPrevPage.addEventListener('click', () => { if (pageNum > 1) { pageNum--; renderPage(pageNum); } });
    pdfNextPage.addEventListener('click', () => { if (pageNum < pdfDoc.numPages) { pageNum++; renderPage(pageNum); } });

    document.getElementById('ctx-delete').addEventListener('click', async () => {
        if (!contextTarget) return;
        const { panelId } = contextTarget;
        const panel = panels[panelId];
        const selectedItems = panel.fileList.querySelectorAll('.selected');
        if (selectedItems.length === 0) {
            showToast('Por favor, selecciona uno o más elementos para eliminar.', 'warning');
            hideContextMenu();
            return;
        }
        const fileNames = Array.from(selectedItems).map(item => item.dataset.fileName);
        const pathsToDelete = await Promise.all(fileNames.map(name => window.electronAPI.pathJoin(panel.currentPath, name)));
        hideContextMenu();

        const response = await window.electronAPI.showConfirmDialog({
            title: 'Eliminar Archivos',
            message: `¿Seguro que quieres eliminar ${fileNames.length} elemento(s) de forma permanente?`,
            detail: 'Esta acción no se puede deshacer.'
        });

        if (response === 1) { // 1 is the index for "Aceptar"
            showProgressIndicator('eliminar');
            window.electronAPI.deleteFiles(pathsToDelete);
        }
    });

    document.getElementById('ctx-new-folder').addEventListener('click', () => {
        if (!contextTarget) return;
        createInlineItem('folder', contextTarget.panelId, loadDirectory);
    });

    document.getElementById('ctx-new-file').addEventListener('click', () => {
        if (!contextTarget) return;
        createInlineItem('file', contextTarget.panelId, loadDirectory);
    });

    // --- Search Logic ---
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');
    let isSearching = false;

    function showSearchStatusInPreview(searchPath) {
        clearPreview(); // Oculta otras vistas previas
        const previewContent = document.getElementById('preview-content');
        document.getElementById('preview-default-message').classList.add('hidden');

        // Crea y añade el elemento de estado de búsqueda de forma no destructiva
        const searchStatusEl = document.createElement('div');
        searchStatusEl.className = 'search-status-container';
        searchStatusEl.innerHTML = `
            <style>
                .search-status-container { display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; color: #9aa0a6; text-align: center; padding: 10px; }
                .search-status-container .fa-spinner { font-size: 2.5em; margin-bottom: 20px; }
                .search-status-container h3 { margin: 0 0 10px 0; color: #e8eaed; }
                .search-status-container p { margin: 0; font-family: 'Courier New', Courier, monospace; word-break: break-all; }
            </style>
            <i class="fas fa-spinner fa-spin"></i>
            <h3>Buscando...</h3>
            <p>${searchPath}</p>
        `;
        previewContent.appendChild(searchStatusEl);
    }

    window.electronAPI.onSearchResultFound(async (result) => {
        if (!isSearching) return;
        const oppositePanelId = activePanelId === 'left' ? 'right' : 'left';
        const oppositePanel = panels[oppositePanelId];
        const listItem = await createListItem(result, oppositePanelId, true);
        oppositePanel.fileList.appendChild(listItem);
    });

    window.electronAPI.onSearchFinished(({ error }) => {
        if (!isSearching) return;
        isSearching = false;

        const oppositePanelId = activePanelId === 'left' ? 'right' : 'left';
        const oppositePanel = panels[oppositePanelId];

        clearPreview(); // Restaura el panel de vista previa

        if (error) {
            showToast(`Error en la búsqueda: ${error}`, 'error');
        } else {
            sortSearchResults(oppositePanelId);

            const resultCount = oppositePanel.fileList.querySelectorAll('li[data-file-name]').length;

            if (resultCount === 0) {
                oppositePanel.fileList.innerHTML = '<li class="search-summary"><h4>No se encontraron resultados</h4></li>';
            }
            const summary = document.createElement('li');
            summary.className = 'search-summary';
            summary.innerHTML = `<p>Búsqueda finalizada. Encontrados <strong>${resultCount}</strong> resultados.</p>`;
            if (oppositePanel.fileList.firstChild) {
                oppositePanel.fileList.insertBefore(summary, oppositePanel.fileList.firstChild);
            } else {
                oppositePanel.fileList.appendChild(summary);
            }
        }
        
        searchButton.innerHTML = '<i class="fas fa-search"></i>';
        searchButton.title = 'Buscar';
        searchInput.disabled = false;
    });

    searchButton.addEventListener('click', async () => {
        if (isSearching) {
            window.electronAPI.cancelSearch();
            showToast('Búsqueda cancelada por el usuario.', 'warning');
            
            // Restaurar la UI inmediatamente al cancelar
            isSearching = false;
            clearPreview();
            searchButton.innerHTML = '<i class="fas fa-search"></i>';
            searchButton.title = 'Buscar';
            searchInput.disabled = false;
            return;
        }

        const query = searchInput.value.trim();
        if (!query) {
            showToast('Por favor, ingresa un término de búsqueda.', 'warning');
            return;
        }

        const panel = panels[activePanelId];
        const searchPath = panel.currentPath;

        if (searchPath === 'computer:///') {
            showToast('Por favor, selecciona una carpeta o unidad válida para iniciar la búsqueda.', 'warning');
            return;
        }

        isSearching = true;
        const oppositePanelId = activePanelId === 'left' ? 'right' : 'left';
        const oppositePanel = panels[oppositePanelId];

        // Preparar UI para la búsqueda
        oppositePanel.fileList.innerHTML = '';
        oppositePanel.isSearchResults = true;
        oppositePanel.pathDisplay.textContent = `Resultados de búsqueda para "${query}"`;
        oppositePanel.upButton.querySelector('i').className = 'fas fa-times';
        oppositePanel.upButton.title = 'Limpiar búsqueda';
        
        showSearchStatusInPreview(searchPath);
        
        searchButton.innerHTML = '<i class="fas fa-times"></i>';
        searchButton.title = 'Cancelar Búsqueda';
        searchInput.disabled = true;

        const searchType = document.getElementById('search-type').value;

        window.electronAPI.startSearch(searchPath, query, searchType);
    });

    // --- Resizer Logic ---
    const resizer = document.getElementById('resizer');
    const rightPanel = document.getElementById('panel-right');
    const container = document.querySelector('.container');

    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        container.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const mouseMoveHandler = (e) => {
            if (!isResizing) return;
            const containerRect = container.getBoundingClientRect();
            const previewPanelMinWidth = 200; // Mínimo ancho para el panel de vista previa
            const rightPanelMinWidth = 200; // Mínimo ancho para el panel derecho

            // Posición del ratón relativa al contenedor principal
            const mouseX = e.clientX - containerRect.left;

            // Ancho total disponible para los paneles flexibles
            const totalFlexWidth = rightPanel.offsetWidth + previewPanel.offsetWidth;

            let newRightPanelWidth = mouseX - rightPanel.getBoundingClientRect().left;
            let newPreviewPanelWidth = totalFlexWidth - newRightPanelWidth;

            if (newRightPanelWidth < rightPanelMinWidth || newPreviewPanelWidth < previewPanelMinWidth) {
                return; // No permitir redimensionar por debajo del mínimo
            }

            // Usar flex para un comportamiento más predecible
            rightPanel.style.flex = `0 0 ${newRightPanelWidth}px`;
            previewPanel.style.flex = `1 1 ${newPreviewPanelWidth}px`;
        };

        const mouseUpHandler = () => {
            isResizing = false;
            container.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            window.removeEventListener('mousemove', mouseMoveHandler);
            window.removeEventListener('mouseup', mouseUpHandler);
        };

        window.addEventListener('mousemove', mouseMoveHandler);
        window.addEventListener('mouseup', mouseUpHandler);
    });

    // Initial Load
    try {
        // Obtener las rutas de Descargas y Escritorio del usuario
        const downloadsPath = await window.electronAPI.getDownloadsPath();
        const desktopPath = await window.electronAPI.getDesktopPath();

        loadDirectory('left', downloadsPath);  // Panel izquierdo inicia en la carpeta de Descargas
        loadDirectory('right', desktopPath);   // Panel derecho inicia en la carpeta del Escritorio
        // Establecer visualmente el panel izquierdo como activo por defecto
        panels.left.container.classList.add('panel-active');
    } catch (e) {
        console.error('Error during initial load:', e);
        showToast(`Error en la carga inicial: ${e.message}`, 'error');
    }
});

async function handleFileOperation(operation, sourcePanelId, destPanelId, options = {}) {
    const sourcePanel = panels[sourcePanelId];
    const destPanel = panels[destPanelId];
    const selectedItems = sourcePanel.fileList.querySelectorAll('.selected');

    if (selectedItems.length === 0) {
        return showToast(`Por favor, selecciona elementos para ${operation}.`, 'warning');
    }

    const fileNames = Array.from(selectedItems).map(item => item.dataset.fileName);
    if (fileNames.includes('..')) return;

    const destDirectory = destPanel.currentPath;
    const sourcePaths = await Promise.all(fileNames.map(name => window.electronAPI.pathJoin(sourcePanel.currentPath, name)));

    for (const sourcePath of sourcePaths) {
        if (destDirectory.startsWith(sourcePath) && destDirectory !== sourcePath) {
            return showToast(`Error: No se puede ${operation} una carpeta a un subdirectorio de sí misma.`, 'error');
        }
    }

    document.querySelector('#progress-source span').textContent = sourcePanel.currentPath;
    document.querySelector('#progress-destination span').textContent = destDirectory;

    // Set the main title based on the initial selection
    const titleEl = document.getElementById('move-progress-title');
    const operationTitle = operation.charAt(0).toUpperCase() + operation.slice(1);
    if (fileNames.length === 1) {
        titleEl.textContent = `${operationTitle}: ${fileNames[0]}`;
    } else {
        titleEl.textContent = `${operationTitle} ${fileNames.length} elementos`;
    }

    showProgressIndicator(operation);
    if (operation === 'mover') {
        window.electronAPI.moveFiles(sourcePaths, destDirectory, options);
    } else if (operation === 'copiar') {
        window.electronAPI.copyFiles(sourcePaths, destDirectory, options);
    }
}

function createInlineItem(type, panelId, loadDirFunc) {
    hideContextMenu();
    const panel = panels[panelId];
    const tempItem = document.createElement('li');
    const icon = document.createElement('i');
    icon.className = `file-icon fas ${type === 'folder' ? 'fa-folder' : 'fa-file-alt'}`;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = type === 'folder' ? 'Nueva Carpeta' : 'nuevo-archivo.txt';
    tempItem.appendChild(icon);
    tempItem.appendChild(input);
    panel.fileList.prepend(tempItem);
    input.focus();
    input.select();
    const finishCreation = async () => {
        const newName = input.value.trim();
        if (newName) {
            const newPath = await window.electronAPI.pathJoin(panel.currentPath, newName);
            const { success, error } = type === 'folder' 
                ? await window.electronAPI.createFolder(newPath)
                : await window.electronAPI.createFile(newPath);
            if (!success) showToast(`Error al crear: ${error}`, 'error');
        }
        setTimeout(loadDirFunc, 0, panelId, panel.currentPath);
    };
    input.addEventListener('blur', finishCreation);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') {
            input.removeEventListener('blur', finishCreation);
            setTimeout(loadDirFunc, 0, panelId, panel.currentPath);
        }
    });
}

function showContextMenu(e, panelId, targetItem) {
    e.preventDefault();
    contextTarget = { panelId, item: targetItem };

    if (targetItem) {
        const panel = panels[panelId];
        if (!e.ctrlKey && !targetItem.classList.contains('selected')) {
            panel.fileList.querySelectorAll('.selected').forEach(sel => sel.classList.remove('selected'));
        }
        targetItem.classList.add('selected');
    }

    const selectionCount = panels[panelId].fileList.querySelectorAll('.selected').length;
    const isFileOrDir = !!targetItem && targetItem.dataset.fileName !== '..';

    document.getElementById('ctx-rename').style.display = (isFileOrDir && selectionCount === 1) ? 'block' : 'none';
    document.getElementById('ctx-delete').style.display = (isFileOrDir && selectionCount > 0) ? 'block' : 'none';
    document.getElementById('ctx-new-folder').style.display = !isFileOrDir ? 'block' : 'none';
    document.getElementById('ctx-new-file').style.display = !isFileOrDir ? 'block' : 'none';

    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.display = 'block';
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.style.display = 'none';
        contextTarget = null;
    }
}