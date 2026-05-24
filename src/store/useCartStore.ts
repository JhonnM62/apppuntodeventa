import { create } from 'zustand';
import Toast from 'react-native-toast-message';

export interface CartItemModifier {
  name: string;
  price: number;
  quantity?: number;
}

export interface CartItem {
  IDproductos: string;
  nombre: string;
  precioUnitario?: string | number;
  Precio_Unitario?: string | number;
  Stock?: number;
  quantity: number;
  modifiers?: CartItemModifier[];
  [key: string]: any;
}

interface CartStore {
  cart: CartItem[];
  cartStartTime: string | null;
  editingSaleId: string | null;
  editingVenta: any | null;
  originalCartIds: string[];
  addToCart: (product: any) => void;
  removeFromCart: (productId: string) => void;
  decrementQuantity: (productId: string) => void;
  clearCart: () => void;
  addModifier: (productId: string, modifier: CartItemModifier) => void;
  removeModifier: (productId: string, modifierName: string) => void;
  setEditingSale: (saleId: string | null, venta?: any | null) => void;
  loadCartFromVenta: (ordenVentas: any[]) => void;
  getNewProductsOnly: () => CartItem[];
  getTotalItems: () => number;
  getTotalPrice: () => number;
  discountPercent: number;
  setDiscountPercent: (percent: number) => void;
  getDiscountAmount: () => number;
  getFinalTotalPrice: () => number;
}

const useCartStore = create<CartStore>((set, get) => ({
  cart: [],
  cartStartTime: null,
  discountPercent: 0,
  editingSaleId: null,
  editingVenta: null,
  originalCartIds: [],
  setDiscountPercent: (percent: number) => set({ discountPercent: percent }),
  getDiscountAmount: () => {
    const subtotal = get().getTotalPrice();
    const exactDiscount = subtotal * get().discountPercent;
    // Redondear hacia abajo al múltiplo de 1000 más cercano (ej. 3600 -> 3000)
    return Math.floor(exactDiscount / 1000) * 1000;
  },
  getFinalTotalPrice: () => {
    const subtotal = get().getTotalPrice();
    const discount = get().getDiscountAmount();
    return subtotal - discount;
  },
  addToCart: (product: any) => {
    const currentState = get();
    const isNewCart = currentState.cart.length === 0 && !currentState.editingSaleId;

    set((state) => {
      const existing = state.cart.find((item) => item.IDproductos === product.IDproductos);
      
      // Stock validation
      const availableStock = product.Stock !== undefined ? Number(product.Stock) : Infinity;
      const currentQty = existing ? existing.quantity : 0;
      
      if (currentQty >= availableStock) {
        Toast.show({ type: 'error', text1: 'Stock insuficiente', text2: `Solo hay ${availableStock} unidades disponibles de ${product.nombre}.` });
        return state;
      }

      const cartStartTime = isNewCart ? new Date().toISOString() : state.cartStartTime;

      if (existing) {
        return {
          cartStartTime,
          cart: state.cart.map((item) =>
            item.IDproductos === product.IDproductos
              ? { ...item, quantity: item.quantity + 1 }
              : item
          ),
        };
      }
      return { cartStartTime, cart: [...state.cart, { ...product, quantity: 1 }] };
    });
  },
  decrementQuantity: (productId: string) => {
    set((state) => {
      const existing = state.cart.find((item) => item.IDproductos === productId);
      if (!existing) return state;

      if (existing.quantity <= 1) {
        return { cart: state.cart.filter((item) => item.IDproductos !== productId) };
      }

      return {
        cart: state.cart.map((item) =>
          item.IDproductos === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        ),
      };
    });
  },
  removeFromCart: (productId: string) => {
    set((state) => ({
      cart: state.cart.filter((item) => item.IDproductos !== productId),
    }));
  },
  addModifier: (productId: string, modifier: CartItemModifier) => {
    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.IDproductos === productId) {
          const currentModifiers = item.modifiers || [];
          const existingIndex = currentModifiers.findIndex(m => m.name === modifier.name);
          
          if (existingIndex >= 0) {
            // Update quantity of existing modifier
            const updatedModifiers = [...currentModifiers];
            updatedModifiers[existingIndex] = { ...updatedModifiers[existingIndex], quantity: modifier.quantity || 1 };
            return { ...item, modifiers: updatedModifiers };
          } else {
            // Add new modifier with default quantity 1 if not specified
            return { ...item, modifiers: [...currentModifiers, { ...modifier, quantity: modifier.quantity || 1 }] };
          }
        }
        return item;
      }),
    }));
  },
  removeModifier: (productId: string, modifierName: string) => {
    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.IDproductos === productId && item.modifiers) {
          return {
            ...item,
            modifiers: item.modifiers.filter((mod) => mod.name !== modifierName),
          };
        }
        return item;
      }),
    }));
  },
  clearCart: () => set({ cart: [], cartStartTime: null, discountPercent: 0, editingSaleId: null, editingVenta: null, originalCartIds: [] }),
  setEditingSale: (saleId: string | null, venta: any | null = null) => set({ editingSaleId: saleId, editingVenta: venta, originalCartIds: [] }),
  loadCartFromVenta: (ordenVentas: any[]) => {
    const cartItems = ordenVentas.map((item) => {
      let parsedModifiers = [];
      try {
        if (item.comentarios) {
          parsedModifiers = JSON.parse(item.comentarios);
        }
      } catch (e) {
        // Fallback for old comma-separated or plain text
        if (item.comentarios) {
          parsedModifiers = [{ name: item.comentarios, price: 0 }];
        }
      }
      return {
        IDproductos: item.producto?.IDproductos || item.productoId || item.IDorderventas,
        nombre: item.nombreProducto || item.producto?.nombre || item.nombre || 'Producto',
        precioUnitario: item.precio,
        Precio_Unitario: item.precio,
        quantity: item.cantidad || 1,
        categoriaNombre: item.categoriaProducto || item.categoria,
        imagenUrl: item.imagenUrl || item.producto?.imagenUrl || item.producto?.image,
        modifiers: parsedModifiers,
        ...item,
      };
    });
    const originalIds = cartItems.map((item) => item.IDproductos);
    set({ cart: cartItems, originalCartIds: originalIds });
  },
  getNewProductsOnly: () => {
    const { cart, originalCartIds } = get();
    return cart.filter((item) => !originalCartIds.includes(item.IDproductos));
  },
  getTotalItems: () => {
    return get().cart.reduce((total, item) => total + item.quantity, 0);
  },
  getTotalPrice: () => {
    return get().cart.reduce((total, item) => {
      const unitPrice = Number(item.precioUnitario || item.Precio_Unitario || 0);
      const modifiersTotal = (item.modifiers || []).reduce((sum, mod) => sum + (Number(mod.price) * (mod.quantity || 1)), 0);
      return total + (unitPrice * item.quantity) + modifiersTotal;
    }, 0);
  },
}));

export default useCartStore;