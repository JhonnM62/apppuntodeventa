# Sistema de Imágenes de Insumos y Mejoras UI en Inventario

## 1. Almacenamiento y Backend (Opción A)
- **Base de Datos:** Verificación/Creación de la columna `imagen` (String, nullable) en la tabla `Insumos` usando Prisma.
- **Upload Endpoint (NestJS):** Creación de un endpoint `POST /insumos/upload-image`.
  - Utilizará `FileInterceptor` (Multer).
  - Almacenamiento físico en el directorio `./public/uploads/insumos/` del servidor local.
  - Retornará la ruta relativa (ej. `/uploads/insumos/foto123.jpg`).
- **Archivos Estáticos:** Configuración de NestJS (`ServeStaticModule` u homólogo) para servir la carpeta `/public` estáticamente, permitiendo al frontend consumir las imágenes vía URL.

## 2. Frontend: Formulario de Creación/Edición (Enfoque 1)
- **UI:** En `InsumoFormScreen.tsx`, se agregará un componente táctil (Avatar/Placeholder) para la foto.
- **Captura (Ambas Opciones):** Uso de `expo-image-picker` para mostrar un ActionSheet/Modal preguntando: "Tomar Foto" o "Elegir de la Galería".
- **Flujo de Guardado:** 
  1. Selección de foto -> Vista previa local.
  2. Al presionar "Guardar" -> Se sube la foto al endpoint `upload-image`.
  3. Se recibe la URL `/uploads/...`.
  4. Se inyecta la URL en el payload de creación/edición de Insumo y se envía la petición final.

## 3. Frontend: Selección de Productos (One-Click)
- **Componente Select:** Se mantiene el componente `<Select>` actual.
- **Fix Bug Doble Toque:** Aplicar `keyboardShouldPersistTaps="handled"` al `ScrollView`/`FlatList` interno del modal de selección.
- **Miniaturas:** Agregar un componente `<Image>` circular a la izquierda del nombre del producto en el renderizado de la lista. (Mostrar icono placeholder si no hay imagen).

## 4. Frontend: Vistas de Detalle y Listados
- **Miniaturas Globales:** Las imágenes en miniatura se mostrarán en todas las listas relevantes (Entradas, Salidas, Registros, Listado de Insumos).
- **Corrección UI Detalle Salidas:**
  - En la vista de Detalle de Salidas (y registros de salidas), se **eliminarán** las etiquetas de precios ("Valor por unidad").
  - La UI para Salidas mostrará estrictamente: Nombre, Stock Inicial, Cantidad Retirada, y Stock Restante.
  - La etiqueta de texto "Pidiendo: X und" se restringirá para que aparezca **exclusivamente** en la vista de Detalle de Entradas.