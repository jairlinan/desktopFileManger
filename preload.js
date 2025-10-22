const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileManager: () => ipcRenderer.send('open-file-manager'),
  // Configuración y Rutas
  getAppPaths: () => ipcRenderer.invoke('get-app-paths'),

  // Navegación y lectura
  getDirectoryContent: (path, sortBy, sortOrder) => ipcRenderer.invoke('get-directory-content', path, sortBy, sortOrder),
  getInitialPath: () => ipcRenderer.invoke('get-initial-path'),
  
  // Operaciones de Path
  pathJoin: (...args) => ipcRenderer.invoke('path-join', ...args),
  pathDirname: (p) => ipcRenderer.invoke('path-dirname', p),
  pathBasename: (p) => ipcRenderer.invoke('path-basename', p),
  
  // Operaciones de Archivos
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('fs-rename', oldPath, newPath),
  createFolder: (path) => ipcRenderer.invoke('fs-create-folder', path),
  createFile: (path) => ipcRenderer.invoke('fs-create-file', path),
  openFile: (path) => ipcRenderer.invoke('shell-open-path', path),  
  getPlatform: () => process.platform,
  checkFileExistence: (paths) => ipcRenderer.invoke('fs-check-existence', paths),
  getLogicalDrives: () => ipcRenderer.invoke('get-logical-drives'),
  startSearch: (searchPath, query, searchType) => ipcRenderer.send('start-search', searchPath, query, searchType),
  cancelSearch: () => ipcRenderer.send('cancel-search'),
  getFileAsDataUrl: (filePath) => ipcRenderer.invoke('get-file-as-data-url', filePath),
  getFileAsBuffer: (filePath) => ipcRenderer.invoke('get-file-as-buffer', filePath),
  showConfirmDialog: (options) => ipcRenderer.invoke('show-confirm-dialog', options),

  // Operaciones en segundo plano con progreso
  moveFiles: (sourcePaths, destDir, options) => ipcRenderer.send('move-files', sourcePaths, destDir, options),
  copyFiles: (sourcePaths, destDir, options) => ipcRenderer.send('copy-files', sourcePaths, destDir, options),
  deleteFiles: (paths) => ipcRenderer.send('delete-files', paths),
  cancelOperation: () => ipcRenderer.send('cancel-operation'),

  // Listeners para progreso
  onSearchResultFound: (callback) => ipcRenderer.on('search-result-found', (event, result) => callback(result)),
  onSearchFinished: (callback) => ipcRenderer.on('search-finished', (event, data) => callback(data)),
  onOperationProgress: (callback) => ipcRenderer.on('operation-progress', (event, data) => callback(data)),
  onOperationComplete: (callback) => ipcRenderer.on('operation-complete', (event, data) => callback(data)),
});
