const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const fse = require('fs-extra');
const { exec } = require('child_process');

// Registrar el protocolo personalizado
// Temporarily commented out to fix startup error
// if (process.defaultApp) {
//   if (process.argv.length >= 2) {
//     app.setAsDefaultProtocolClient('notesapp', process.execPath, [path.resolve(process.argv[1])]);
//   }
// } else {
//   app.setAsDefaultProtocolClient('notesapp');
// }

function createFileManagerWindow() {
  const fileManagerWindow = new BrowserWindow({
    width: 1400,
    height: 800,
    icon: path.join(__dirname, 'assets/icons/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
  fileManagerWindow.loadFile(path.join(__dirname, 'index.html'));
  fileManagerWindow.setMenu(null);
}

// #region File System Reading
async function getHiddenFilesWindows(dirPath) {
    return new Promise((resolve) => {
        const command = `chcp 65001>nul && attrib "${path.join(dirPath, '* ')}"`;
        exec(command, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) {
                resolve(new Set());
                return;
            }
            const hiddenFiles = new Set();
            const lines = stdout.split('\n');
            lines.forEach(line => {
                const trimmedLine = line.trim();
                if (trimmedLine && trimmedLine.toUpperCase().startsWith('A')) {
                    const attributes = line.substring(0, 12).toUpperCase();
                    if (attributes.includes('H')) {
                        const filePath = line.substring(12).trim();
                        hiddenFiles.add(path.basename(filePath));
                    }
                }
            });
            resolve(hiddenFiles);
        });
    });
}

ipcMain.handle('get-directory-content', async (event, dirPath, sortBy = 'name', sortOrder = 'asc') => {
  try {
    const platform = process.platform;
    let hiddenFilesWindows = new Set();
    if (platform === 'win32') {
        hiddenFilesWindows = await getHiddenFilesWindows(dirPath);
    }

    const dirents = await fsPromises.readdir(dirPath, { withFileTypes: true });
    
    const fileListPromises = dirents.map(async dirent => {
      const itemPath = path.join(dirPath, dirent.name);
      let stats = null;
      try {
        stats = await fsPromises.stat(itemPath);
      } catch (statError) { return null; }

      const isHidden = (platform === 'win32' && hiddenFilesWindows.has(dirent.name)) || dirent.name.startsWith('.');

      return {
        name: dirent.name,
        isDirectory: dirent.isDirectory(),
        size: stats.size,
        mtime: stats.mtime.getTime(),
        isHidden: isHidden
      };
    });

    let fileList = (await Promise.all(fileListPromises)).filter(item => item !== null);

    fileList.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;

      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          break;
        case 'type':
          const extA = a.isDirectory ? '' : path.extname(a.name).toLowerCase();
          const extB = b.isDirectory ? '' : path.extname(b.name).toLowerCase();
          comparison = extA.localeCompare(extB, undefined, { sensitivity: 'base' });
          if (comparison === 0) {
            comparison = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          }
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'date':
          comparison = a.mtime - b.mtime;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return { files: fileList };
  } catch (error) {
    console.error('Error reading directory:', error);
    return { error: error.message };
  }
});

// PASO 4: Exposición de Rutas al Proceso de Renderizado
// Este handler permite que el frontend (proceso de renderizado) solicite
// las rutas dinámicas de la aplicación de forma segura.
ipcMain.handle('get-app-paths', () => {
  return {
    uploads: process.env.UPLOADS_PATH,
    backups: process.env.BACKUPS_PATH,
    fileManager: process.env.FILE_MANAGER_BASE_PATH,
  };
});


ipcMain.handle('get-initial-path', () => app.getPath('home'));
ipcMain.handle('path-join', (event, ...args) => path.join(...args));
ipcMain.handle('path-dirname', (event, p) => path.dirname(p));
ipcMain.handle('path-basename', (event, p) => path.basename(p));

ipcMain.handle('fs-check-existence', async (event, paths) => {
    const existingPaths = [];
    for (const p of paths) {
        if (fs.existsSync(p)) {
            existingPaths.push(p);
        }
    }
    return existingPaths;
});

ipcMain.handle('get-logical-drives', async () => {
    if (process.platform !== 'win32') {
        return { success: true, drives: [{ name: '/', isDirectory: true, isDrive: true, label: 'Raíz' }] };
    }
    const command = 'powershell.exe -NoProfile -Command "Get-Volume | Select-Object DriveLetter, FileSystemLabel | ConvertTo-Json -Compress"';
    return new Promise((resolve) => {
        exec(command, (error, stdout) => {
            if (error) return resolve({ success: false, error: error.message });
            try {
                if (!stdout.trim()) return resolve({ success: true, drives: [] });
                const rawDrives = JSON.parse(stdout);
                const drives = [].concat(rawDrives)
                    .filter(d => d.DriveLetter)
                    .map(d => ({ name: `${d.DriveLetter}:`, label: d.FileSystemLabel || 'Disco Local', isDirectory: true, isDrive: true }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                resolve({ success: true, drives });
            } catch (parseError) {
                resolve({ success: false, error: parseError.message });
            }
        });
    });
});

ipcMain.on('open-file-manager', () => {
  createFileManagerWindow();
});
// #endregion

// #region Simple File Operations
ipcMain.handle('fs-rename', async (event, oldPath, newPath) => {
    try {
        await fsPromises.rename(oldPath, newPath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('fs-create-folder', async (event, folderPath) => {
    try {
        await fsPromises.mkdir(folderPath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('fs-create-file', async (event, filePath) => {
    try {
        await fsPromises.writeFile(filePath, '');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('shell-open-path', async (event, filePath) => {
    const errorMessage = await shell.openPath(filePath);
    if (errorMessage) return { success: false, error: errorMessage };
    return { success: true };
});
// #endregion

// #region Preview Handlers
ipcMain.handle('get-file-as-data-url', async (event, filePath) => {
    try {
        const fileBuffer = await fsPromises.readFile(filePath);
        const mimeType = `image/${path.extname(filePath).slice(1)}`;
        return { success: true, dataUrl: `data:${mimeType};base64,${fileBuffer.toString('base64')}` };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-file-as-buffer', async (event, filePath) => {
    try {
        const buffer = await fsPromises.readFile(filePath);
        return { success: true, buffer };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('show-confirm-dialog', async (event, options) => {
    const choice = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Cancelar', 'Aceptar'],
        defaultId: 1,
        title: options.title || 'Confirmación',
        message: options.message,
        detail: options.detail || ''
    });
    return choice.response; // 0 for Cancelar, 1 for Aceptar
});
// #endregion

// #region Complex File Operations with Progress

let isOperationCancelled = false;
ipcMain.on('cancel-operation', () => {
    isOperationCancelled = true;
});

// 1. Helper to get a flat list of all files and total size
async function getRecursiveFilelistAndSize(sourcePaths) {
    let fileList = [];
    let totalSize = 0;
    const errors = [];

    for (const sourcePath of sourcePaths) {
        if (isOperationCancelled) break;
        try {
            const stats = await fsPromises.stat(sourcePath);
            if (stats.isDirectory()) {
                const subFiles = await fse.readdir(sourcePath);
                for (const file of subFiles) {
                    if (isOperationCancelled) break;
                    const fullPath = path.join(sourcePath, file);
                    const { fileList: subFileList, totalSize: subTotalSize, errors: subErrors } = await getRecursiveFilelistAndSize([fullPath]);
                    fileList.push(...subFileList);
                    totalSize += subTotalSize;
                    errors.push(...subErrors);
                }
            } else {
                fileList.push({ path: sourcePath, size: stats.size });
                totalSize += stats.size;
            }
        } catch (error) {
            errors.push({ file: sourcePath, error: error.message });
        }
    }
    return { fileList, totalSize, errors };
}

// 2. Core function to copy a list of files with progress
async function performCopy(event, fileList, totalSize, destDir, options) {
    let processedSize = 0;
    const errors = [];
    const startTime = Date.now();

    for (const file of fileList) {
        if (isOperationCancelled) break;

        const relativePath = path.relative(options.baseSourceDir, file.path);
        let destPath = path.resolve(destDir, relativePath);

        try {
            if (options.conflictAction === 'rename' && fs.existsSync(destPath)) {
                destPath = await getAvailableName(destPath);
            }
            
            await fsPromises.mkdir(path.dirname(destPath), { recursive: true });

            const readStream = fs.createReadStream(file.path);
            const writeStream = fs.createWriteStream(destPath);

            for await (const chunk of readStream) {
                if (isOperationCancelled) {
                    readStream.destroy();
                    writeStream.destroy();
                    break;
                }
                writeStream.write(chunk);
                processedSize += chunk.length;

                const elapsedTime = (Date.now() - startTime) / 1000;
                const bytesPerSecond = processedSize / elapsedTime;
                const remainingBytes = totalSize - processedSize;
                const etrSeconds = bytesPerSecond > 0 ? remainingBytes / bytesPerSecond : Infinity;

                event.sender.send('operation-progress', { 
                    currentFile: path.basename(file.path),
                    processedBytes: processedSize,
                    totalSize: totalSize,
                    etr: isFinite(etrSeconds) ? etrSeconds : -1,
                });
            }
        } catch (error) {
            errors.push({ file: file.path, error: error.message });
        }
    }
    return { success: errors.length === 0, errors };
}

// 3. IPC Handlers using the new logic
ipcMain.on('copy-files', async (event, sourcePaths, destDir, options) => {
    isOperationCancelled = false;
    const baseSourceDir = path.dirname(sourcePaths[0]);

    try {
        // Phase 1: Calculate
        event.sender.send('operation-progress', { title: 'Calculando...' });
        const { fileList, totalSize, errors: calcErrors } = await getRecursiveFilelistAndSize(sourcePaths);
        if (isOperationCancelled) {
            return event.sender.send('operation-complete', { cancelled: true });
        }

        // Phase 2: Copy
        const { success, errors: copyErrors } = await performCopy(event, fileList, totalSize, destDir, { ...options, baseSourceDir });
        
        const allErrors = [...calcErrors, ...copyErrors];
        event.sender.send('operation-complete', {
            success: allErrors.length === 0,
            errors: allErrors,
            action: 'copia',
            cancelled: isOperationCancelled
        });
    } catch (error) {
        event.sender.send('operation-complete', {
            success: false,
            errors: [{ file: 'Calculation', error: error.message }],
            action: 'copia',
            cancelled: false
        });
    }
});

ipcMain.on('move-files', async (event, sourcePaths, destDir, options) => {
    isOperationCancelled = false;
    const baseSourceDir = path.dirname(sourcePaths[0]);

    try {
        // For move, we always do copy-then-delete to ensure progress reporting.
        // Phase 1: Calculate
        event.sender.send('operation-progress', { title: 'Calculando...' });
        const { fileList, totalSize, errors: calcErrors } = await getRecursiveFilelistAndSize(sourcePaths);
        if (isOperationCancelled) {
            return event.sender.send('operation-complete', { cancelled: true });
        }

        // Phase 2: Copy
        const { success, errors: copyErrors } = await performCopy(event, fileList, totalSize, destDir, { ...options, baseSourceDir });
        let allErrors = [...calcErrors, ...copyErrors];

        // Phase 3: Delete source if copy was successful
        if (success && !isOperationCancelled) {
            event.sender.send('operation-progress', { title: 'Finalizando movimiento...', processedBytes: totalSize, totalSize });
            for (const sourcePath of sourcePaths) {
                try {
                    await fse.remove(sourcePath);
                } catch (error) {
                    allErrors.push({ file: sourcePath, error: error.message });
                }
            }
        }
        
        event.sender.send('operation-complete', {
            success: allErrors.length === 0,
            errors: allErrors,
            action: 'movimiento',
            cancelled: isOperationCancelled
        });
    } catch (error) {
        event.sender.send('operation-complete', {
            success: false,
            errors: [{ file: 'Calculation', error: error.message }],
            action: 'movimiento',
            cancelled: false
        });
    }
});

ipcMain.on('delete-files', async (event, pathsToDelete) => {
    isOperationCancelled = false;
    
    try {
        event.sender.send('operation-progress', { title: 'Calculando...' });
        const { fileList, totalSize, errors: calcErrors } = await getRecursiveFilelistAndSize(pathsToDelete);
        let processedSize = 0;
        const deleteErrors = [];

        if (isOperationCancelled) {
            return event.sender.send('operation-complete', { cancelled: true });
        }

        for (const file of fileList) {
            if (isOperationCancelled) break;
            try {
                event.sender.send('operation-progress', { 
                    currentFile: path.basename(file.path),
                    processedBytes: processedSize,
                    totalSize: totalSize,
                });
                await fsPromises.rm(file.path, { recursive: true, force: true });
                processedSize += file.size;
            } catch (error) {
                console.error(`Error al eliminar el archivo ${file.path}:`, error);
                deleteErrors.push({ file: file.path, error: error.message });
            }
        }

        // For directories in the original selection that might be empty
        for (const sourcePath of pathsToDelete) {
             if (isOperationCancelled) break;
            try {
                const stats = await fsPromises.stat(sourcePath);
                if (stats.isDirectory()) {
                    await fse.remove(sourcePath);
                }
            } catch (e) { /* Ignore, likely already deleted */ }
        }

        const allErrors = [...calcErrors, ...deleteErrors];
        event.sender.send('operation-complete', {
            success: allErrors.length === 0,
            errors: allErrors,
            action: 'eliminación',
            cancelled: isOperationCancelled
        });
    } catch (error) {
        event.sender.send('operation-complete', {
            success: false,
            errors: [{ file: 'Calculation', error: error.message }],
            action: 'eliminación',
            cancelled: false
        });
    }
});
// #endregion

// #region Search
let isSearchCancelled = false;

async function searchFilesRecursive(event, dirPath, query, searchType) {
  if (isSearchCancelled) return;

  let items;
  try {
    items = await fsPromises.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    // Ignore access errors (e.g., permissions)
    return;
  }

  for (const item of items) {
    if (isSearchCancelled) return;

    const fullPath = path.join(dirPath, item.name);
    const nameMatch = item.name.toLowerCase().includes(query.toLowerCase());

    // Primero, verificar si el nombre del item (archivo O carpeta) coincide.
    if (nameMatch) {
      try {
        const stats = await fsPromises.stat(fullPath);
        event.sender.send('search-result-found', {
          path: fullPath,
          name: item.name,
          isDirectory: item.isDirectory(),
          size: stats.size,
          mtime: stats.mtime.getTime()
        });
      } catch (e) { /* Ignorar errores de stats */ }
    }

    // Segundo, decidir si se debe profundizar en la búsqueda.
    if (item.isDirectory()) {
      // Siempre se busca recursivamente dentro de las carpetas.
      await searchFilesRecursive(event, fullPath, query, searchType);
    } else if (searchType === 'content' && !nameMatch) {
      // Si es un ARCHIVO, su nombre NO coincidió, y el modo es 'content',
      // entonces se revisa el contenido del archivo.
      const ext = path.extname(item.name).toLowerCase();
      const textExtensions = ['.txt', '.md', '.js', '.json', '.css', '.html', '.log', '.xml', '.ts', '.py', '.java'];
      if (textExtensions.includes(ext)) {
        try {
          const content = await fsPromises.readFile(fullPath, 'utf-8');
          if (content.toLowerCase().includes(query.toLowerCase())) {
            const stats = await fsPromises.stat(fullPath);
            event.sender.send('search-result-found', {
              path: fullPath,
              name: item.name,
              isDirectory: false,
              size: stats.size,
              mtime: stats.mtime.getTime()
            });
          }
        } catch (e) { /* Ignorar errores de lectura */ }
      }
    }
  }
}

ipcMain.on('start-search', async (event, searchPath, query, searchType) => {
  isSearchCancelled = false;
  try {
    await searchFilesRecursive(event, searchPath, query, searchType);
  } catch (error) {
    event.sender.send('search-finished', { error: error.message });
  } finally {
    // Signal that the search has finished
    event.sender.send('search-finished', { error: null });
  }
});

ipcMain.on('cancel-search', () => {
  isSearchCancelled = true;
});
// #endregion

// #region App Lifecycle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Si se intenta abrir una segunda instancia, enfoca la ventana existente.
    const allWindows = BrowserWindow.getAllWindows();
    if (allWindows.length > 0) {
      if (allWindows[0].isMinimized()) allWindows[0].restore();
      allWindows[0].focus();
    }
  });

  app.whenReady().then(() => {
    try {
      // PASO 1: Detección de Entorno y Definición de Rutas
      // Este bloque establece las variables de entorno ANTES de que cualquier otra
      // parte de la aplicación (como el servidor web) se inicie.
      if (app.isPackaged) {
          // Entorno de PRODUCCIÓN (aplicación empaquetada)
          const userDataPath = app.getPath('userData');
          process.env.IS_PACKAGED = 'true';
          process.env.USER_DATA_PATH = userDataPath;
          // Definir rutas para datos de usuario en producción
          process.env.UPLOADS_PATH = path.join(userDataPath, 'uploads');
          process.env.BACKUPS_PATH = path.join(userDataPath, 'backups');
          process.env.FILE_MANAGER_BASE_PATH = path.join(userDataPath, 'notesApp_Files');
      } else {
        // Entorno de DESARROLLO
        process.env.IS_PACKAGED = 'false';
        // Definir rutas para datos de usuario en desarrollo (relativas al proyecto)
        process.env.UPLOADS_PATH = path.join(__dirname, '..', 'src', 'public', 'uploads');
        process.env.BACKUPS_PATH = path.join(__dirname, '..', 'backups');
        process.env.FILE_MANAGER_BASE_PATH = path.join(__dirname, '..', 'notesApp_Files');
      }

      // PASO 3: Creación Automática de Directorios
      // Aseguramos que las carpetas de datos existan antes de iniciar la app.
      // Esto previene errores si se intenta usar una ruta que aún no ha sido creada.
      fs.mkdirSync(process.env.UPLOADS_PATH, { recursive: true });
      fs.mkdirSync(path.join(process.env.UPLOADS_PATH, 'tmp'), { recursive: true });
      fs.mkdirSync(process.env.BACKUPS_PATH, { recursive: true });
      fs.mkdirSync(process.env.FILE_MANAGER_BASE_PATH, { recursive: true });

      // Iniciar directamente la ventana del gestor de archivos.
      createFileManagerWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createFileManagerWindow();
        }
      });

    } catch (error) {
      // En caso de un error de arranque muy grave, lo mostramos en un diálogo simple.
      dialog.showErrorBox(
        'Error de Arranque',
        `No se pudo iniciar la aplicación:\n${error.stack || error.message}`
      );
      app.quit();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('open-url', (event, url) => {
  // Future use: handle opening specific paths
});
// #endregion