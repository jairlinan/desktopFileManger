# Desktop File Manager

`desktopFileManger` es una aplicación de escritorio multiplataforma, construida con Electron, que proporciona una interfaz de doble panel para una gestión de archivos eficiente y robusta.

 <!-- Reemplazar con una captura de pantalla real -->

---

## ✨ Funcionalidades Principales

A continuación se detallan las características clave de la aplicación:

### 1. Interfaz de Doble Panel
- **Navegación Paralela**: Permite trabajar con dos directorios diferentes de forma simultánea, facilitando la comparación y transferencia de archivos.
- **Panel Activo**: El panel actualmente en uso se resalta visualmente para mejorar la claridad.

### 2. Navegación y Visualización de Archivos
- **Exploración de Unidades**: El panel izquierdo se inicia mostrando las unidades lógicas del sistema (`C:`, `D:`, etc., en Windows o `/` en sistemas POSIX).
- **Navegación Jerárquica**: Permite subir y bajar en la estructura de directorios de forma intuitiva.
- **Ordenamiento Personalizado**: Los archivos y carpetas se pueden ordenar por:
    - Nombre (alfabéticamente)
    - Tipo (extensión)
    - Tamaño
    - Fecha de modificación
- **Visualización de Archivos Ocultos**: Incluye una opción para mostrar u ocultar los archivos y carpetas del sistema.

### 3. Operaciones de Archivos
La aplicación soporta un conjunto completo de operaciones de archivos, con indicadores de progreso para tareas de larga duración.

- **Copiar y Mover**: Transfiere archivos y carpetas entre los dos paneles de forma rápida. La interfaz muestra el progreso, la velocidad de transferencia y el tiempo restante estimado.
- **Eliminar**: Permite la eliminación permanente de archivos y carpetas, con un diálogo de confirmación para evitar acciones accidentales.
- **Renombrar**: Modifica el nombre de archivos y carpetas directamente desde la interfaz.
- **Crear**: Permite la creación de nuevas carpetas y archivos de texto vacíos a través del menú contextual.

### 4. Búsqueda Avanzada
- **Búsqueda por Nombre**: Realiza una búsqueda recursiva y rápida de archivos y carpetas que coincidan con el término de búsqueda.
- **Búsqueda por Contenido**: Además de por nombre, puede buscar dentro del contenido de archivos de texto plano (`.txt`, `.md`, `.js`, etc.).
- **Resultados en Panel Dedicado**: Los resultados de la búsqueda se muestran en el panel opuesto al de la búsqueda, permitiendo continuar la navegación sin perder el contexto.
- **Cancelación de Búsqueda**: Las búsquedas largas pueden ser canceladas en cualquier momento.

### 5. Panel de Vista Previa
Un panel dedicado a la derecha permite previsualizar archivos sin necesidad de abrirlos con una aplicación externa.

- **Imágenes**: Soporta los formatos más comunes (`.jpg`, `.png`, `.gif`, `.svg`, etc.).
- **Documentos PDF**: Incluye un visor de PDF integrado con controles para navegar entre páginas.
- **Archivos de Texto**: Muestra el contenido de archivos de texto plano como `.txt`, `.md`, `.js`, `.json`, `.html`, entre otros.

### 6. Interacción y Usabilidad
- **Menú Contextual**: Un menú contextual (clic derecho) proporciona acceso rápido a las operaciones más comunes (renombrar, eliminar, crear).
- **Selección Múltiple**: Soporta la selección de múltiples elementos mediante `Ctrl+Click` y `Shift+Click`.
- **Arrastrar y Soltar (Drag and Drop)**: Permite mover o copiar archivos arrastrándolos de un panel a otro.

---

## 🚀 Cómo Empezar

1.  **Clonar el repositorio**:
    ```bash
    git clone https://github.com/tu-usuario/desktopFileManger.git
    ```

2.  **Instalar dependencias**:
    ```bash
    cd desktopFileManger
    npm install
    ```

3.  **Ejecutar la aplicación**:
    ```bash
    npm start
    ```

---

## 🛠️ Pila Tecnológica

- **Framework**: Electron
- **Lenguajes**: HTML, CSS, JavaScript
- **Módulos Clave de Node.js**:
    - `fs` y `fs/promises`: Para operaciones del sistema de archivos.
    - `fs-extra`: Para operaciones complejas como mover y copiar recursivamente.
    - `path`: Para la manipulación de rutas de archivos.
    - `child_process`: Para ejecutar comandos del sistema operativo.

---

Este `README.md` proporciona una visión general del estado y las capacidades actuales de `desktopFileManger`.