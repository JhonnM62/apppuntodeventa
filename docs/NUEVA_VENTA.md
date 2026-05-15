# Flujo de Nueva Venta

El módulo de "Nueva Venta" permite al usuario registrar ventas procesando productos disponibles, gestionando un carrito de compras y enviando la transacción final al backend.

## 1. Endpoints Consumidos

### GET `/api/v1/productos`
- **Descripción**: Obtiene el listado de todos los productos disponibles.
- **Respuesta Exitosa**:
  ```json
  {
    "data": [
      {
        "IDproductos": "1",
        "nombre": "Producto Ejemplo",
        "Precio_Unitario": 1500,
        "Stock": 10,
        "categoriaNombre": "Bebidas",
        "imagenUrl": "https://..."
      }
    ]
  }
  ```

### POST `/api/v1/ventas`
- **Descripción**: Crea un nuevo registro de venta.
- **Payload Enviado**:
  ```json
  {
    "Metodo_Pago": "Efectivo",
    "Detalles": [
      {
        "Id_Producto": "1",
        "Cantidad": 2,
        "Precio_Unitario": 1500
      }
    ]
  }
  ```

## 2. Componentes Principales

- **NewSaleScreen.tsx**: Pantalla principal de ventas. Incluye:
  - Barra de búsqueda interactiva.
  - Listado renderizado con `FlashList` agrupado por categorías.
  - Botón flotante inferior para confirmar el checkout con el precio total calculado en tiempo real.
- **useCartStore.ts**: Zustand store que maneja el carrito:
  - `addToCart`: Agrega producto (valida que la cantidad no supere el `Stock`).
  - `decrementQuantity`: Disminuye la cantidad (elimina si llega a 0).
  - `removeFromCart`: Elimina el producto por completo.

## 3. Validaciones
- **Stock Insuficiente**: El sistema impide agregar un producto si la cantidad en el carrito es mayor o igual al stock disponible, mostrando una alerta.
- **Producto Agotado**: Los productos con `Stock: 0` se visualizan con opacidad reducida (`opacity-50`) y al tocarlos muestran una advertencia en lugar de agregarse al carrito.
- **Carrito Vacío**: El botón de "Cobrar" no se renderiza si no hay productos, previniendo peticiones vacías al backend.
