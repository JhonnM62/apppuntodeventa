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
  setQuantity: (productId: string, quantity: number) => void;
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
    const percent = get().discountPercent;
    if (!percent || percent <= 0) return 0;

    const subtotal = get().getTotalPrice();

    // 100% de descuento = cortesía total de la orden
    if (percent >= 1) {
      return subtotal;
    }

    // Si es el descuento del 15% del hito de fidelidad y el negocio vende granizados
    const hasGranizados = get().cart.some((item) => {
      const cat = String(item.categoriaNombre || item.categoria || item.categoriaProducto || '').toLowerCase();
      const nom = String(item.nombre || item.nombreProducto || '').toLowerCase();
      return /granizado/i.test(cat) || /granizado/i.test(nom);
    });

    if (percent === 0.15 && hasGranizados) {
      const granizadosSubtotal = get().cart.reduce((sum, item) => {
        const cat = String(item.categoriaNombre || item.categoria || item.categoriaProducto || '').toLowerCase();
        const nom = String(item.nombre || item.nombreProducto || '').toLowerCase();

        const isDesechable = /tapa|caja|vaso|empaque|desechable|bolsa|envase|cubierto/i.test(cat + ' ' + nom);
        if (isDesechable) return sum;

        const isGranizado = /granizado/i.test(cat) || /granizado/i.test(nom);
        if (!isGranizado) return sum;

        let unitPrice = Number(item.precioUnitario || item.Precio_Unitario);
        if (isNaN(unitPrice)) unitPrice = 0;
        let qty = Number(item.quantity);
        if (isNaN(qty)) qty = 1;

        let itemTotal = unitPrice * qty;
        if (Array.isArray(item.modifiers)) {
          const modTotal = item.modifiers.reduce((mSum, mod) => {
            const mPrice = Number(mod.price) || 0;
            const mQty = Number(mod.quantity) || 1;
            return mSum + mPrice * mQty;
          }, 0);
          itemTotal += modTotal;
        }
        return sum + itemTotal;
      }, 0);

      const exactDiscount = granizadosSubtotal * percent;
      return Math.round(exactDiscount);
    }

    // Descuentos generales del modal (-10%, -30%, -40%, etc.) o en comercios sin granizados
    const exactDiscount = subtotal * percent;
    return Math.round(exactDiscount);
  },
  getFinalTotalPrice: () => {
    const subtotal = get().getTotalPrice();
    const discount = get().getDiscountAmount();
    return Math.max(0, subtotal - discount);
  },
  addToCart: (product: any) => {
    const currentState = get();
    const isNewCart = currentState.cart.length === 0 && !currentState.editingSaleId;

    set((state) => {
      const existing = state.cart.find((item) => item.IDproductos === product.IDproductos);
      
      // Stock validation
      const isAvailabilityEnabled = product.mostrarDisponibilidad === true || product.mostrarDisponibilidad === 1 || product.mostrarDisponibilidad === 'true' || product.mostrarDisponibilidad === 'si';
      
      let shelfAvailable = Infinity;
      if (isAvailabilityEnabled) {
        const { useProductStore } = require('./useProductStore'); // lazy load to avoid circular deps
        shelfAvailable = useProductStore.getState().getDisponibilidadReal(product.IDproductos);
      }
          
      if (shelfAvailable <= 0 && isAvailabilityEnabled) {
        Toast.show({ type: 'error', text1: 'Stock insuficiente', text2: `No hay más unidades disponibles de ${product.nombre}.` });
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
  setQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) {
      set((state) => ({ cart: state.cart.filter((item) => item.IDproductos !== productId) }));
      return;
    }
    
    set((state) => {
      const existing = state.cart.find((item) => item.IDproductos === productId);
      if (existing) {
        const isAvailabilityEnabled = existing.mostrarDisponibilidad === true || existing.mostrarDisponibilidad === 1 || existing.mostrarDisponibilidad === 'true' || existing.mostrarDisponibilidad === 'si';
        let maxAllowed = Infinity;
        if (isAvailabilityEnabled) {
          const { useProductStore } = require('./useProductStore');
          const shelfAvailable = useProductStore.getState().getDisponibilidadReal(existing.IDproductos);
          maxAllowed = shelfAvailable + existing.quantity;
        }
            
        if (quantity > maxAllowed && isAvailabilityEnabled) {
          Toast.show({ type: 'error', text1: 'Stock insuficiente', text2: `Solo puedes llevar ${maxAllowed} unidades.` });
          return state; // Do not update
        }
      }

      return {
        cart: state.cart.map((item) =>
          item.IDproductos === productId ? { ...item, quantity } : item
        ),
      };
    });
  },
  addModifier: (productId: string, modifier: CartItemModifier) => {
    set((state) => ({
      cart: state.cart.map((item) => {
        if (item.IDproductos === productId) {
          const currentModifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
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
        if (item.IDproductos === productId && Array.isArray(item.modifiers)) {
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
    if (!Array.isArray(ordenVentas) || ordenVentas.length === 0) {
      set({ cart: [], originalCartIds: [] });
      return;
    }

    const sanitizeModifiers = (item: any): CartItemModifier[] => {
      let raw: any = null;

      // 1. Ya viene como array en item.modifiers
      if (Array.isArray(item?.modifiers)) {
        raw = item.modifiers;
      } else if (typeof item?.modifiers === 'string' && item.modifiers.trim()) {
        try {
          raw = JSON.parse(item.modifiers.trim());
        } catch {
          raw = [{ name: item.modifiers.trim(), price: 0, quantity: 1 }];
        }
      } else if (item?.comentarios) {
        // 2. Extraer de item.comentarios
        if (Array.isArray(item.comentarios)) {
          raw = item.comentarios;
        } else if (typeof item.comentarios === 'string') {
          const trimmed = item.comentarios.trim();
          if (trimmed.length > 0) {
            try {
              const parsed = JSON.parse(trimmed);
              if (Array.isArray(parsed)) {
                raw = parsed;
              } else if (parsed && typeof parsed === 'object') {
                raw = [parsed];
              } else {
                raw = [{ name: String(parsed), price: 0, quantity: 1 }];
              }
            } catch {
              raw = [{ name: trimmed, price: 0, quantity: 1 }];
            }
          }
        } else if (typeof item.comentarios === 'object' && item.comentarios !== null) {
          raw = [item.comentarios];
        }
      }

      if (!Array.isArray(raw)) {
        return [];
      }

      const cleanList: CartItemModifier[] = [];
      for (const m of raw) {
        if (!m) continue;
        if (typeof m === 'string') {
          let s = m.trim();
          if (s.startsWith('{')) {
            try {
              const inner = JSON.parse(s);
              s = String(inner.name || inner.nombre || inner.Nombre || s).trim();
            } catch (e) {}
          }
          if (s) cleanList.push({ name: s, price: 0, quantity: 1 });
        } else if (typeof m === 'object') {
          let name = String(m.name || m.nombre || m.Nombre || m.observacion || m.comentario || '').trim();
          if (name.startsWith('{')) {
            try {
              const inner = JSON.parse(name);
              name = String(inner.name || inner.nombre || inner.Nombre || name).trim();
            } catch (e) {}
          }
          if (name) {
            const price = Number(m.price ?? m.precio ?? m.Precio ?? 0);
            const quantity = Number(m.quantity ?? m.cantidad ?? 1);
            cleanList.push({
              name,
              price: isNaN(price) ? 0 : price,
              quantity: isNaN(quantity) || quantity <= 0 ? 1 : quantity,
            });
          }
        }
      }
      return cleanList;
    };

    const groupedCart: Record<string, CartItem> = {};

    ordenVentas.forEach((item, itemIdx) => {
      if (!item) return;
      const id = String(item.producto?.IDproductos || item.productoId || item.IDorderventas || item.IDproductos || item.id || `cart-item-${itemIdx}`);
      const parsedModifiers = sanitizeModifiers(item);
      const itemQty = Number(item.cantidad) || 1;
      const rawPrice = item.precio != null ? item.precio : (item.precioUnitario != null ? item.precioUnitario : (item.Precio_Unitario != null ? item.Precio_Unitario : 0));
      const unitPrice = Number(rawPrice) || 0;

      if (groupedCart[id]) {
        groupedCart[id].quantity += itemQty;
        
        if (!Array.isArray(groupedCart[id].modifiers)) {
          groupedCart[id].modifiers = [];
        }

        // Merge modifiers de forma segura
        parsedModifiers.forEach(mod => {
          const existingMod = groupedCart[id].modifiers!.find(m => m.name === mod.name);
          if (existingMod) {
            existingMod.quantity = (existingMod.quantity || 1) + (mod.quantity || 1);
          } else {
            groupedCart[id].modifiers!.push({ ...mod });
          }
        });
      } else {
        groupedCart[id] = {
          ...item,
          IDproductos: id,
          nombre: item.nombreProducto || item.producto?.nombre || item.nombre || 'Producto',
          precioUnitario: unitPrice,
          Precio_Unitario: unitPrice,
          quantity: itemQty,
          categoriaNombre: item.categoriaProducto || item.categoria || item.producto?.categoria?.nombre || item.producto?.categoriaNombre,
          imagenUrl: item.imagenUrl || item.producto?.imagenUrl || item.producto?.image,
          modifiers: parsedModifiers,
          seccionCocinaId: item.seccionCocinaId || item.categoriaSeccionCocinaId || (item as any).producto?.seccionCocinaId || (item as any).producto?.categoria?.seccionCocinaId || (item as any).producto?.categoriaRelacion?.seccionCocinaId || (item as any).producto?.categoriaSeccionCocinaId || null,
        };
      }
    });

    const cartItems = Object.values(groupedCart);
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
      let unitPrice = Number(item.precioUnitario || item.Precio_Unitario);
      if (isNaN(unitPrice)) unitPrice = 0;
      
      let modifiersTotal = 0;
      if (Array.isArray(item.modifiers)) {
        modifiersTotal = item.modifiers.reduce((sum, mod) => {
          let modPrice = Number(mod.price);
          if (isNaN(modPrice)) modPrice = 0;
          let modQty = Number(mod.quantity);
          if (isNaN(modQty)) modQty = 1;
          return sum + (modPrice * modQty);
        }, 0);
      }
      
      let qty = Number(item.quantity);
      if (isNaN(qty)) qty = 1;

      return total + (unitPrice * qty) + modifiersTotal;
    }, 0);
  },
}));

export default useCartStore;
